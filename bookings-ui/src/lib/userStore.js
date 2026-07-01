// userStore.js — user & role management.
// Talks to the backend user API. Every mutating call carries the acting admin's
// email (actorEmail) so the backend can enforce region-bounded scope.

export const REGIONS = ['CLD-HQ', 'CLD-CTC', 'CLD-EMEA']

// Backend UserOut (snake_case) → UI shape (camelCase).
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

// Surface the backend's error detail so Admin.jsx's catch shows a useful message.
async function readError(res) {
  try {
    const body = await res.json()
    return body.detail || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export async function listUsers() {
  const res = await fetch('/api/users')
  if (!res.ok) throw new Error(await readError(res))
  const data = await res.json()
  return data.map(toUI)
}

// The backend PATCH route is keyed by integer id; the UI keys by email.
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