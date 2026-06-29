// notifications.js — approval reminders via Microsoft Graph.
// Stubbed for now; flip SEND_LIVE once Graph access + a Teams webhook land.
import { approversForRegion } from './userConfig'
import { getGraphToken} from './msalConfig'

const SEND_LIVE = false

function buildEmail(booking, approverEmail) {
  return {
    message: {
      subject: `Approval needed: ${booking.title} (${booking.region})`,
      body: {
        contentType: 'HTML',
        content:
          `<p>A booking is awaiting your approval.</p>` +
          `<p><strong>${booking.operationLabel}</strong> — ${booking.title}<br/>` +
          `Region: ${booking.region}<br/>` +
          `Date: ${booking.start}${booking.end && booking.end !== booking.start ? ` → ${booking.end}` : ''}<br/>` +
          `Submitted by: ${booking.submittedBy || booking.csmEmail || '—'}</p>` +
          `<p>Open the scheduler to review.</p>`,
      },
      toRecipients: [{ emailAddress: { address: approverEmail } }],
    },
    saveToSentItems: false,
  }
}


async function sendEmail(payload) {
  if (!SEND_LIVE) { console.log('[stub] Outlook email →', payload); return { ok: true, stub: true } }
  const token = await getGraphToken()
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  return { ok: res.ok }
}


// Fire reminders to every approver scoped to the booking's region.
export async function notifyApproversForBooking(booking) {
  const approvers = approversForRegion(booking.region)
  const results = []
  for (const email of approvers) {
    results.push(await sendEmail(buildEmail(booking, email)))
  }
  return results
}