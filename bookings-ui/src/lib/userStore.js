// userStore.js — user & role management. Postgres is the single role source.
export const REGIONS = ['CLD-HQ', 'CLD-CTC', 'CLD-EMEA']

function toUI(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    regions: u.regions ?? [],
    displayName: u.display_name ?? '',
    active: u.active,
    seeded: u.seeded,
  }
}

async function readError(res) {
  try {
    const body = await res.json()
    return body.detail || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

// Resolve the signed-in user. null => not on the allowlist (403/404); throws on real failure.
export async function fetchMe(email) {
  const q = new URLSearchParams({ email: (email || '').toLowerCase() })
  const res = await fetch(`/api/users/me?${q}`)
  if (res.status === 403 || res.status === 404) return null
  if (!res.ok) throw new Error(await readError(res))
  return toUI(await res.json())
}

// Approvers/admins whose region scope covers `region` (used by notifications).
export async function approversForRegion(region) {
  const users = await listUsers()
  return users
    .filter((u) => u.active && (u.role === 'approver' || u.role === 'admin'))
    .filter((u) => (u.regions || []).includes('*') || (u.regions || []).includes(region))
    .map((u) => u.email)
}

export async function listUsers() {
  const res = await fetch('/api/users')
  if (!res.ok) throw new Error(await readError(res))
  const data = await res.json()
  return data.map(toUI)
}

async function idForEmail(email) {
  const key = (email || '').toLowerCase()
  const users = await listUsers()
  const match = users.find((u) => u.email.toLowerCase() === key)
  if (!match) throw new Error('User not found.')
  return match.id
}

export async function addUser({ email, role, regions = [], displayName = '' }, actorEmail) {
  const q = new URLSearchParams({ actor_email: actorEmail || '' })
  const res = await fetch(`/api/users?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: (email || '').toLowerCase().trim(),
      display_name: displayName,
      role,
      regions: role === 'requester' ? [] : regions,
    }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return toUI(await res.json())
}

export async function updateUser(email, patch, actorEmail) {
  const id = await idForEmail(email)
  const body = {}
  if (patch.displayName !== undefined) body.display_name = patch.displayName
  if (patch.role !== undefined) body.role = patch.role
  if (patch.regions !== undefined) body.regions = patch.regions
  if (patch.active !== undefined) body.active = patch.active
  const q = new URLSearchParams({ actor_email: actorEmail || '' })
  const res = await fetch(`/api/users/${id}?${q}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res))
  return toUI(await res.json())
}

export async function setActive(email, active, actorEmail) {
  const id = await idForEmail(email)
  const q = new URLSearchParams({ actor_email: actorEmail || '' })
  const res = await fetch(`/api/users/${id}?${q}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return toUI(await res.json())
}