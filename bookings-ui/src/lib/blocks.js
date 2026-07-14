const BASE = '/api/blocks'

async function req(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try { const b = await res.json(); if (b.detail) msg = b.detail } catch {}
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export async function listBlocks() {
  const rows = await req(BASE)
  return rows.map((b) => ({
    id: b.id,
    blockDate: b.block_date,
    endDate: b.end_date || b.block_date,   // single-day blocks end where they start
    blockTime: b.block_time,          // null = whole day
    title: b.title || '',
    regions: b.regions,
    reason: b.reason,
    createdBy: b.created_by,
    createdAt: b.created_at,
  }))
}

export async function addBlock({ blockDate, endDate, blockTime, title, regions, reason }, actorEmail) {
  return req(`${BASE}?actor_email=${encodeURIComponent(actorEmail)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      block_date: blockDate,
      end_date: endDate || blockDate,
      block_time: blockTime || null,
      title: title || null,
      regions,
      reason: reason || null,
    }),
  })
}

export async function removeBlock(blockId, actorEmail) {
  return req(`${BASE}/${blockId}?actor_email=${encodeURIComponent(actorEmail)}`, { method: 'DELETE' })
}