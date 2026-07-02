import json
from fastapi import APIRouter, HTTPException
from database import get_pool
from models import BookingCreate, BookingUpdate, BookingOut

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

# Fields the general PATCH may set, mapped to their columns. Approval-related
# columns (status='approved', approved_by/at) are deliberately excluded.
EDITABLE = (
    "region", "scheduled_date", "scheduled_time", "company_name", "company_id",
    "environment_id", "environment_name", "host_region", "notes",
)


def row_to_booking(row) -> dict:
    """asyncpg returns JSONB as a string; parse details back into a dict."""
    d = dict(row)
    raw = d.get("details")
    d["details"] = json.loads(raw) if isinstance(raw, str) else raw
    return d


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
    return [row_to_booking(r) for r in rows]


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(booking: BookingCreate):
    pool = await get_pool()
    details_json = json.dumps(booking.details.model_dump()) if booking.details else None
    row = await pool.fetchrow(
        """INSERT INTO bookings
               (process_type, operation_type, region, scheduled_date, scheduled_time,
                company_name, company_id, environment_id, environment_name,
                host_region, notes, requester_email, requester_name, details)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *""",
        booking.process_type, booking.operation_type, booking.region,
        booking.scheduled_date, booking.scheduled_time,
        booking.company_name, booking.company_id,
        booking.environment_id, booking.environment_name,
        booking.host_region, booking.notes,
        booking.requester_email, booking.requester_name,
        details_json,
    )
    return row_to_booking(row)


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

    # details is JSONB — serialize before binding.
    if update.details is not None:
        args.append(json.dumps(update.details.model_dump()))
        sets.append(f"details = ${len(args)}")

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
    return row_to_booking(row)


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
    # Region check only applies to region-scoped bookings (migration). OCU rows
    # have region = NULL and are not region-gated.
    if (approver["role"] == "approver" and existing["region"] is not None
            and existing["region"] not in list(approver["regions"] or [])):
        raise HTTPException(403, "Not authorized to approve bookings in this region")

    row = await pool.fetchrow(
        """UPDATE bookings SET status = 'approved', approved_by = $2,
               approved_at = now(), updated_at = now()
           WHERE id = $1 RETURNING *""",
        booking_id, approver_email,
    )
    return row_to_booking(row)


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
    if (approver["role"] == "approver" and existing["region"] is not None
            and existing["region"] not in list(approver["regions"] or [])):
        raise HTTPException(403, "Not authorized to reject bookings in this region")

    row = await pool.fetchrow(
        """UPDATE bookings SET status = 'rejected', approved_by = $2,
               approved_at = now(), updated_at = now()
           WHERE id = $1 RETURNING *""",
        booking_id, approver_email,
    )
    return row_to_booking(row)