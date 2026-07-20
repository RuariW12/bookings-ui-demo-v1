// notifications.js
// Sends an "action needed" email to the regional approvers when an approvable
// booking is created. Reservations (soft holds) do NOT call this; only the Book
// path in App.jsx does.
//
// Approvers are resolved from Postgres (the single role source) via /api/users,
// replacing the deleted userConfig.js. The message is sent from the signed-in
// user's mailbox through Microsoft Graph (/me/sendMail). If Graph is unavailable
// (tenant OAuth policy, no token), the send is logged and skipped so booking
// creation is never blocked.

import { listUsers } from './userStore'
import { getGraphToken } from './msalConfig'

// Flip to false to force console-only logging during local dev.
const SEND_LIVE = true

// Placeholder link. Swap for the real approvals URL once the domain is live.
const APPROVALS_LINK =
  import.meta.env && import.meta.env.VITE_APP_URL
    ? `${import.meta.env.VITE_APP_URL}/approvals`
    : 'https://bluejay.example.com/approvals'

// Active approvers/admins whose region scope covers the booking's region.
async function approversForRegion(region) {
  const users = await listUsers()
  return users
    .filter((u) => u.active)
    .filter((u) => u.role === 'approver' || u.role === 'admin')
    .filter((u) => (u.regions || []).includes('*') || (u.regions || []).includes(region))
    .map((u) => u.email)
}

function buildEmail(booking, approverEmails) {
  const label = booking.operationLabel || booking.title || 'booking'
  const name = booking.title || booking.companyName || label
  const dateLine =
    booking.end && booking.end !== booking.start
      ? `${booking.start} to ${booking.end}`
      : booking.start || 'TBD'

  return {
    message: {
      subject: `Action needed: approve ${label} (${booking.region})`,
      body: {
        contentType: 'HTML',
        content:
          `<p>A new booking needs your approval.</p>` +
          `<p><strong>${name}</strong><br/>` +
          `Operation: ${label}<br/>` +
          `Region: ${booking.region}<br/>` +
          `Date: ${dateLine}<br/>` +
          `Submitted by: ${booking.submittedBy || booking.csmEmail || 'unknown'}</p>` +
          `<p><a href="${APPROVALS_LINK}">Review and approve in bluejay</a></p>`,
      },
      toRecipients: approverEmails.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: false,
  }
}

async function sendEmail(payload) {
  if (!SEND_LIVE) {
    console.log('[notifications] stub send:', payload)
    return { ok: true, stub: true }
  }
  try {
    const token = await getGraphToken()
    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    // Graph unavailable (tenant policy, no token). Never block the booking.
    console.warn('[notifications] Graph send failed, skipped:', err)
    return { ok: false, error: String(err) }
  }
}

// Called only from the Book path (approvable bookings), never from Reserve.
export async function notifyApproversForBooking(booking) {
  if (!booking || !booking.region) {
    console.warn('[notifications] no region on booking, skipping approver notice')
    return { ok: false, skipped: true }
  }

  let approvers = []
  try {
    approvers = await approversForRegion(booking.region)
  } catch (err) {
    console.warn('[notifications] could not resolve approvers:', err)
    return { ok: false, error: String(err) }
  }

  if (approvers.length === 0) {
    console.warn(`[notifications] no active approvers for ${booking.region}`)
    return { ok: false, noApprovers: true }
  }

  return sendEmail(buildEmail(booking, approvers))
}