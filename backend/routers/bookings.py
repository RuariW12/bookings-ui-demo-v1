from fastapi import APIRouter, HTTPException
from database import get_pool
from models import BookingCreate, BookingOut

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


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
    return [dict(r) for r in rows]


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(booking: BookingCreate):
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO bookings
               (operation_type, region, scheduled_date, scheduled_time,
                company_name, company_id, environment_id, environment_name,
                host_region, notes, requester_email, requester_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *""",
        booking.operation_type, booking.region,
        booking.scheduled_date, booking.scheduled_time,
        booking.company_name, booking.company_id,
        booking.environment_id, booking.environment_name,
        booking.host_region, booking.notes,
        booking.requester_email, booking.requester_name,
    )
    return dict(row)


async def _decide(booking_id: int, approver_email: str, new_status: str):
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
        raise HTTPException(403, "Not authorized for this region")

    row = await pool.fetchrow(
        """UPDATE bookings SET status = $2, approved_by = $3,
               approved_at = now(), updated_at = now()
           WHERE id = $1 RETURNING *""",
        booking_id, new_status, approver_email,
    )
    return dict(row)


@router.patch("/{booking_id}/approve", response_model=BookingOut)
async def approve_booking(booking_id: int, approver_email: str):
    return await _decide(booking_id, approver_email, "approved")


@router.patch("/{booking_id}/reject", response_model=BookingOut)
async def reject_booking(booking_id: int, approver_email: str):
    return await _decide(booking_id, approver_email, "rejected")