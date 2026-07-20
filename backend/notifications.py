import logging
from html import escape

from config import settings
from graph_mail import graph_configured, send_mail

log = logging.getLogger("bookings.notifications")


async def _approver_emails(pool, region: str) -> list[str]:
    """Active approvers/admins whose region scope covers this region (or '*')."""
    rows = await pool.fetch(
        """SELECT email FROM users
           WHERE active = true
             AND role IN ('approver', 'admin')
             AND ($1 = ANY(regions) OR '*' = ANY(regions))""",
        region,
    )
    return [r["email"] for r in rows]


def _build_body(booking: dict) -> tuple[str, str]:
    label = booking.get("operation_type") or "booking"
    company = booking.get("company_name") or booking.get("cid") or label
    region = booking.get("region") or "unknown region"
    date = booking.get("scheduled_date") or "TBD"
    time_ = booking.get("scheduled_time") or ""
    submitter = booking.get("requester_name") or booking.get("requester_email") or "unknown"
    link = settings.app_approvals_url

    subject = f"Action needed: approve {label} ({region})"
    body_html = (
        f"<p>A new booking needs your approval.</p>"
        f"<p><strong>{escape(str(company))}</strong><br/>"
        f"Operation: {escape(str(label))}<br/>"
        f"Region: {escape(str(region))}<br/>"
        f"Date: {escape(str(date))} {escape(str(time_))}<br/>"
        f"Submitted by: {escape(str(submitter))}</p>"
        f'<p><a href="{escape(link)}">Review and approve in bluejay</a></p>'
    )
    return subject, body_html


async def notify_approvers_for_booking(pool, booking: dict) -> None:
    """Best-effort approver email for a newly created, approvable booking.
    Never raises: the booking has already committed, so a mail failure is logged
    and swallowed rather than surfaced to the requester."""
    if not graph_configured():
        log.info("Graph not configured; skipping approver email for booking %s", booking.get("id"))
        return

    region = booking.get("region")
    if not region:
        log.info("Booking %s has no region; skipping approver email", booking.get("id"))
        return

    try:
        recipients = await _approver_emails(pool, region)
        if not recipients:
            log.info("No active approvers for region %s; nothing to send", region)
            return
        subject, body_html = _build_body(booking)
        await send_mail(recipients, subject, body_html)
        log.info("Approver email sent for booking %s to %s", booking.get("id"), recipients)
    except Exception as e:
        log.warning("Approver email failed for booking %s: %s", booking.get("id"), e)