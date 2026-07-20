import { PublicClientApplication } from '@azure/msal-browser'

// Client/tenant IDs are not secrets (they ship in the browser bundle), but they
// differ per environment. infra/main.tf writes VITE_ENTRA_* into .env at boot and
// leaves them as the literal "UNSET" when no value is configured, so treat that
// as absent and fall back to the dev app registration.
const envOr = (v, fallback) => (!v || v === 'UNSET' ? fallback : v)

const CLIENT_ID = envOr(import.meta.env.VITE_ENTRA_CLIENT_ID, '70a9935f-ada2-45a8-9ec5-7c55eb5bb62d')
const TENANT_ID = envOr(import.meta.env.VITE_ENTRA_TENANT_ID, '901c038b-4638-4259-b115-c1753c7735aa')

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    // Authority is a URL, not a bare tenant GUID. Single-tenant: the tenant ID
    // pins sign-in to the Strategy directory.
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    // Adapts to wherever the app is served, so localhost and prod need no code
    // change. Each origin still has to be registered in Entra.
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest = {
  scopes: ['User.Read', 'Mail.Send'],
}

export const msalInstance = new PublicClientApplication(msalConfig)

// notifications.js — approval reminders via Microsoft Graph.
// Stubbed for now; flip SEND_LIVE once Graph access + a Teams webhook land.
import { approversForRegion } from './userStore'
import { getGraphToken } from './msalConfig'

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
  const approvers = await approversForRegion(booking.region)
  const results = []
  for (const email of approvers) {
    results.push(await sendEmail(buildEmail(booking, email)))
  }
  return results
}