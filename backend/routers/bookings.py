import json
from fastapi import APIRouter, HTTPException
from database import get_pool
from models import BookingCreate, BookingUpdate, AssignUpdate, BookingOut
from snow import create_case

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

# Fields the general PATCH may set, mapped to their columns. Approval-related
# columns (status='approved', approved_by/at) are deliberately excluded.
EDITABLE = (
    "region", "scheduled_date", "scheduled_time", "company_name", "company_id",
    "environment_id", "environment_name", "host_region", "notes",
)

# Case fields not stored on the booking. VERIFY these picklist values with a
# test POST to dev SNOW before trusting them.
CASE_DEFAULTS = {
    "u_environment": "PROD",        # "PROD" confirmed live; "DEV" assumed
    "u_product_version": "2021",    # UNVERIFIED — live record showed "MicroStrategy ONE"
    "u_severity": "Sev 3",          # only "Sev 4" confirmed live
    "priority": "4",
}


def _row(r) -> dict:
    """asyncpg returns JSONB as a string — parse `assignees` back to a list."""
    d = dict(r)
    a = d.get("assignees")
    if isinstance(a, str):
        d["assignees"] = json.loads(a) if a else []
    elif a is None:
        d["assignees"] = []
    return d


def _build_case_payload(booking: dict, approver_email: str) -> dict:
    return {
        "short_description":
            f"{booking['operation_type']} — {booking.get('company_name') or ''}".strip(" —"),
        "description": (
            f"Region: {booking.get('region') or '—'}\n"
            f"Environment: {booking.get('environment_name') or '—'}\n"
            f"Scheduled: {booking.get('scheduled_date') or '—'} "
            f"{booking.get('scheduled_time') or ''}".rstrip()
            + f"\nRequester: {booking.get('requester_name') or booking.get('requester_email') or '—'}"
            + f"\nApproved by: {approver_email}"
        ),
        "contact_type": "web",
        "account": booking["company_id"],       # SNOW account sys_id
        "u_dsi": booking["environment_id"],      # SNOW DSI sys_id
        **CASE_DEFAULTS,
    }


@router.get("", response_model=list[BookingOut])
async def list_bookings(region: str | None = None, status: str | None = None):
    pool = await get_pool()
    query = "SELECT * FROM bookings WHERE 1=1"
    args = []
    if region:
        args.append(region)
        query += f" AND region = ${len(args)}"
    if status:
        args.append(status)
        query += f" AND status = ${len(args)}"
    query += " ORDER BY created_at DESC"
    rows = await pool.fetch(query, *args)
    return [_row(r) for r in rows]


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(booking: BookingCreate):
    pool = await get_pool()

    # Reject bookings that land on a blocked date/slot for this region.
    # A whole-day block has block_time IS NULL; a slot block matches the exact time.
    blocked = await pool.fetchval(
        """SELECT count(*) FROM schedule_blocks
           WHERE block_date = $1
             AND $2 = ANY(regions)
             AND (block_time IS NULL OR block_time = $3)""",
        booking.scheduled_date, booking.region, booking.scheduled_time,
    )
    if blocked:
        raise HTTPException(409, "This date/time is blocked for the selected region")

    row = await pool.fetchrow(
        """INSERT INTO bookings
               (operation_type, region, scheduled_date, scheduled_time,
                company_name, company_id, cid, environment_id, environment_name,
                host_region, notes, requester_email, requester_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING *""",
        booking.operation_type, booking.region,
        booking.scheduled_date, booking.scheduled_time,
        booking.company_name, booking.company_id,
        booking.environment_id, booking.environment_name,
        booking.host_region, booking.notes,
        booking.requester_email, booking.requester_name,
    )
    return _row(row)


@router.patch("/{booking_id}", response_model=BookingOut)
async def update_booking(booking_id: int, update: BookingUpdate):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT * FROM bookings WHERE id = $1", booking_id)
    if not existing:
        raise HTTPException(404, "Booking not found")

    # Collect the editable fields the caller actually sent.
    sets, args = [], []
    for field in EDITABLE:
        val = getattr(update, field)
        if val is not None:
            args.append(val)
            sets.append(f"{field} = ${len(args)}")

    # Status here is scoped to cancel/restore only; approval owns its own route.
    if update.status is not None:
        if update.status not in ("pending", "cancelled"):
            raise HTTPException(400, "status may only be set to 'pending' or 'cancelled' here")
        args.append(update.status)
        sets.append(f"status = ${len(args)}")

    if not sets:
        raise HTTPException(400, "No editable fields provided")

    args.append(booking_id)
    row = await pool.fetchrow(
        f"UPDATE bookings SET {', '.join(sets)}, updated_at = now() WHERE id = ${len(args)} RETURNING *",
        *args,
    )
    return _row(row)


@router.patch("/{booking_id}/approve", response_model=BookingOut)
async def approve_booking(booking_id: int, approver_email: str):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT * FROM bookings WHERE id = $1", booking_id)
    if not existing:
        raise HTTPException(404, "Booking not found")
    if existing["status"] != "pending":
        raise HTTPException(400, f"Booking is already {existing['status']}")

    approver = await pool.fetchrow(
        "SELECT * FROM users WHERE email = $1 AND active = true", approver_email
    )
    if not approver or approver["role"] not in ("approver", "admin"):
        raise HTTPException(403, "Not authorized to approve")
    if approver["role"] == "approver" and existing["region"] not in list(approver["regions"] or []):
        raise HTTPException(403, "Not authorized to approve bookings in this region")

    # Create the SNOW case first. If it fails, the exception propagates and the
    # booking stays pending (retryable). Manual-entry bookings have null sys_ids
    # -> skip case creation, approve anyway (flagged flaw, deferred).
    booking = dict(existing)
    case_id = None
    if booking["company_id"] and booking["environment_id"]:
        result = await create_case(_build_case_payload(booking, approver_email))
        case_id = result["number"]

    row = await pool.fetchrow(
        """UPDATE bookings SET status = 'approved', approved_by = $2,
               approved_at = now(), servicenow_case_id = $3, updated_at = now()
           WHERE id = $1 RETURNING *""",
        booking_id, approver_email, case_id,
    )
    return _row(row)


@router.patch("/{booking_id}/reject", response_model=BookingOut)
async def reject_booking(booking_id: int, approver_email: str):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT * FROM bookings WHERE id = $1", booking_id)
    if not existing:
        raise HTTPException(404, "Booking not found")
    if existing["status"] != "pending":
        raise HTTPException(400, f"Booking is already {existing['status']}")

    approver = await pool.fetchrow(
        "SELECT * FROM users WHERE email = $1 AND active = true", approver_email
    )
    if not approver or approver["role"] not in ("approver", "admin"):
        raise HTTPException(403, "Not authorized to reject")
    if approver["role"] == "approver" and existing["region"] not in list(approver["regions"] or []):
        raise HTTPException(403, "Not authorized to reject bookings in this region")

    row = await pool.fetchrow(
        """UPDATE bookings SET status = 'rejected', approved_by = $2,
               approved_at = now(), updated_at = now()
           WHERE id = $1 RETURNING *""",
        booking_id, approver_email,
    )
    return _row(row)


@router.patch("/{booking_id}/assign", response_model=BookingOut)
async def assign_booking(booking_id: int, assignment: AssignUpdate, approver_email: str):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT * FROM bookings WHERE id = $1", booking_id)
    if not existing:
        raise HTTPException(404, "Booking not found")
    # Assignment happens after approval — you approve, then staff the case.
    if existing["status"] != "approved":
        raise HTTPException(400, "Only approved bookings can be assigned")

    approver = await pool.fetchrow(
        "SELECT * FROM users WHERE email = $1 AND active = true", approver_email
    )
    if not approver or approver["role"] not in ("approver", "admin"):
        raise HTTPException(403, "Not authorized to assign")
    if approver["role"] == "approver" and existing["region"] not in list(approver["regions"] or []):
        raise HTTPException(403, "Not authorized to assign bookings in this region")

    payload = [a.model_dump() for a in assignment.assignees]
    row = await pool.fetchrow(
        """UPDATE bookings SET assignees = $2, updated_at = now()
           WHERE id = $1 RETURNING *""",
        booking_id, json.dumps(payload),
    )
    return _row(row)


@router.delete("/{booking_id}", status_code=204)
async def delete_booking(booking_id: int):
    pool = await get_pool()
    result = await pool.execute("DELETE FROM bookings WHERE id = $1", booking_id)
    if result == "DELETE 0":
        raise HTTPException(404, "Booking not found")