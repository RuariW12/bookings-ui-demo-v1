const BASE = '/api/reservations'

async function req(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try { const b = await res.json(); if (b.detail) msg = b.detail } catch {}
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

function toUI(r) {
  return {
    id: r.id,
    groupId: r.group_id,
    operationType: r.operation_type,
    region: r.region,
    date: r.scheduled_date,
    time: r.scheduled_time || '',      // '' for builds
    companyName: r.company_name || '',
    cid: r.cid || '',
    reason: r.reason || '',
    requesterEmail: r.requester_email,
    requesterName: r.requester_name || '',
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }
}

// Live holds only — the backend filters out released/expired rows.
export async function listReservations() {
  const rows = await req(BASE)
  return rows.map(toUI)
}

// Reserve a set of candidate dates as one group. All-or-nothing on the server.
export async function createReservations({
  operationType, region, slots, companyName, cid, reason, requesterEmail, requesterName,
}) {
  const rows = await req(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation_type: operationType,
      region,
      slots: slots.map((s) => ({ scheduled_date: s.date, scheduled_time: s.time || null })),
      company_name: companyName || null,
      cid: cid || null,
      reason,
      requester_email: requesterEmail,
      requester_name: requesterName || null,
    }),
  })
  return rows.map(toUI)
}

export async function releaseGroup(groupId, actorEmail) {
  return req(`${BASE}/group/${encodeURIComponent(groupId)}?actor_email=${encodeURIComponent(actorEmail)}`,
    { method: 'DELETE' })
}

export async function releaseReservation(id, actorEmail) {
  return req(`${BASE}/${id}?actor_email=${encodeURIComponent(actorEmail)}`, { method: 'DELETE' })
}