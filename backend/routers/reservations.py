import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from database import get_pool
from models import ReservationCreate, ReservationOut

router = APIRouter(prefix="/api/reservations", tags=["reservations"])

RESERVATION_DAYS = 7

# A reservation is a soft hold: no approval, no SNOW case, no assignees.
# "Live" is evaluated lazily on every read/write — no cron, no background worker.
# Expired rows stay in the table (audit) but stop having any effect.
LIVE = "released_at IS NULL AND expires_at > now()"


async def _require_user(pool, email: str):
    """Reservations are open to any active user; the allowlist still applies."""
    if not email:
        raise HTTPException(400, "requester_email is required")
    row = await pool.fetchrow(
        "SELECT * FROM users WHERE email = $1 AND active = true", email.lower()
    )
    if not row:
        raise HTTPException(403, "Your account is not authorized for this app")
    return row


@router.get("", response_model=list[ReservationOut])
async def list_reservations():
    pool = await get_pool()
    rows = await pool.fetch(
        f"SELECT * FROM reservations WHERE {LIVE} ORDER BY scheduled_date, scheduled_time"
    )
    return [dict(r) for r in rows]


@router.post("", response_model=list[ReservationOut], status_code=201)
async def create_reservations(res: ReservationCreate):
    pool = await get_pool()
    await _require_user(pool, res.requester_email)

    if not res.slots:
        raise HTTPException(400, "Pick at least one date to reserve")
    if not (res.reason or "").strip():
        raise HTTPException(400, "A reason is required")

    group_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=RESERVATION_DAYS)
    owner = res.requester_email.lower()
    out = []

    # All-or-nothing: if any candidate date clashes, the whole set is rejected
    # so the CSM never ends up holding a partial set they didn't ask for.
    async with pool.acquire() as conn:
        async with conn.transaction():
            for slot in res.slots:
                time_val = slot.scheduled_time or None

                held = await conn.fetchval(
                    f"""SELECT count(*) FROM reservations
                        WHERE {LIVE}
                          AND region = $1 AND scheduled_date = $2
                          AND COALESCE(scheduled_time, '') = COALESCE($3, '')
                          AND lower(requester_email) IS DISTINCT FROM $4""",
                    res.region, slot.scheduled_date, time_val, owner,
                )
                if held:
                    raise HTTPException(409, f"{slot.scheduled_date} is already reserved by another CSM")

                booked = await conn.fetchval(
                    """SELECT count(*) FROM bookings
                        WHERE region = $1 AND scheduled_date = $2
                          AND COALESCE(scheduled_time, '') = COALESCE($3, '')
                          AND status NOT IN ('cancelled', 'rejected')""",
                    res.region, slot.scheduled_date, time_val,
                )
                if booked:
                    raise HTTPException(409, f"{slot.scheduled_date} is already booked")

                blocked = await conn.fetchval(
                    """SELECT count(*) FROM schedule_blocks
                        WHERE $1 BETWEEN block_date AND COALESCE(end_date, block_date)
                          AND $2 = ANY(regions)
                          AND (block_time IS NULL OR block_time = $3)""",
                    slot.scheduled_date, res.region, time_val,
                )
                if blocked:
                    raise HTTPException(409, f"{slot.scheduled_date} is blocked for {res.region}")

                row = await conn.fetchrow(
                    """INSERT INTO reservations
                           (group_id, operation_type, region, scheduled_date, scheduled_time,
                            company_name, cid, reason, requester_email, requester_name, expires_at)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                       RETURNING *""",
                    group_id, res.operation_type, res.region,
                    slot.scheduled_date, time_val,
                    res.company_name, res.cid, res.reason.strip(),
                    owner, res.requester_name, expires_at,
                )
                out.append(dict(row))
    return out


@router.delete("/group/{group_id}", status_code=204)
async def release_group(group_id: str, actor_email: str):
    pool = await get_pool()
    actor = await _require_user(pool, actor_email)
    rows = await pool.fetch(
        f"SELECT * FROM reservations WHERE group_id = $1 AND {LIVE}", group_id
    )
    if not rows:
        raise HTTPException(404, "No live reservation found")
    if actor["role"] != "admin" and rows[0]["requester_email"].lower() != actor_email.lower():
        raise HTTPException(403, "You can only release your own reservations")
    await pool.execute(
        "UPDATE reservations SET released_at = now() WHERE group_id = $1 AND released_at IS NULL",
        group_id,
    )


@router.delete("/{reservation_id}", status_code=204)
async def release_one(reservation_id: int, actor_email: str):
    pool = await get_pool()
    actor = await _require_user(pool, actor_email)
    row = await pool.fetchrow("SELECT * FROM reservations WHERE id = $1", reservation_id)
    if not row or row["released_at"]:
        raise HTTPException(404, "No live reservation found")
    if actor["role"] != "admin" and row["requester_email"].lower() != actor_email.lower():
        raise HTTPException(403, "You can only release your own reservations")
    await pool.execute(
        "UPDATE reservations SET released_at = now() WHERE id = $1", reservation_id
    )