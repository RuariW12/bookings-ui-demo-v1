// notifications.js — approval reminders via Microsoft Graph.
// Stubbed for now; flip SEND_LIVE once Graph access + a Teams webhook land.
import { approversForRegion } from './userConfig'
import { getGraphToken} from './msalConfig'

const SEND_LIVE = false
const TEAMS_WEBHOOK_URL = '' // paste Incoming Webhook URL when available

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

function buildTeamsCard(booking) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: 'Approval needed' },
          { type: 'TextBlock', text: `${booking.operationLabel} — ${booking.title}`, wrap: true },
          { type: 'FactSet', facts: [
            { title: 'Region', value: booking.region },
            { title: 'Date', value: booking.start },
            { title: 'Submitted by', value: booking.submittedBy || booking.csmEmail || '—' },
          ]},
        ],
      },
    }],
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

async function sendTeams(card) {
  if (!SEND_LIVE || !TEAMS_WEBHOOK_URL) { console.log('[stub] Teams card →', card); return { ok: true, stub: true } }
  const res = await fetch(TEAMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  })
  return { ok: res.ok }
}

// Fire reminders to every approver scoped to the booking's region.
export async function notifyApproversForBooking(booking) {
  const approvers = approversForRegion(booking.region)
  const card = buildTeamsCard(booking)
  const results = []
  for (const email of approvers) {
    results.push(await sendEmail(buildEmail(booking, email)))
  }
  results.push(await sendTeams(card))
  return results
}