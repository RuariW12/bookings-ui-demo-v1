// userStore.js — user & role management.
// In-memory mock seeded from current identities. Async-shaped so real backend
// calls (Postgres via an admin endpoint) swap in behind this same interface.

export const REGIONS = ['CLD-HQ', 'CLD-CTC', 'CLD-EMEA']

// Admins are seeded here and NOT manageable through the UI — the admin set is
// deliberately hard to expand. One per region. Replace with real identities.
const SEED = [
  { email: 'rwhalen@strategy.com',       role: 'admin',     regions: ['CLD-HQ'],   displayName: 'Ruari Whalen',    active: true, seeded: true },
  { email: 'admin.ctc@strategy.com',     role: 'admin',     regions: ['CLD-CTC'],  displayName: 'CTC Admin',       active: true, seeded: true },
  { email: 'admin.emea@strategy.com',    role: 'admin',     regions: ['CLD-EMEA'], displayName: 'EMEA Admin',      active: true, seeded: true },
  { email: 'hqmanager1@strategy.com',    role: 'approver',  regions: ['CLD-HQ'],   displayName: 'HQ Manager 1',    active: true },
  { email: 'emeaapprover1@strategy.com', role: 'approver',  regions: ['CLD-EMEA'], displayName: 'EMEA Approver 1', active: true },
  { email: 'csm1@strategy.com',          role: 'requester', regions: [],           displayName: 'CSM One',         active: true },
]

let users = SEED.map((u) => ({ ...u, regions: [...u.regions] }))

const clone = (u) => ({ ...u, regions: [...u.regions] })
const activeAdmins = () => users.filter((u) => u.role === 'admin' && u.active)

export async function listUsers() {
  return users.map(clone)
}

export async function addUser({ email, role, regions = [], displayName = '' }) {
  const key = (email || '').toLowerCase().trim()
  if (!key || !key.includes('@')) throw new Error('A valid email is required.')
  if (role === 'admin') throw new Error('Admins are seeded, not added through the UI.')
  if (role !== 'approver' && role !== 'requester') throw new Error('Invalid role.')
  if (users.some((u) => u.email === key)) throw new Error('That email already exists.')
  if (role === 'approver' && regions.length === 0) throw new Error('An approver needs at least one region.')
  const user = { email: key, role, regions: role === 'requester' ? [] : [...regions], displayName, active: true }
  users.push(user)
  return clone(user)
}

export async function updateUser(email, patch) {
  const key = (email || '').toLowerCase()
  const user = users.find((u) => u.email === key)
  if (!user) throw new Error('User not found.')
  if (user.seeded) throw new Error('Seeded admins cannot be edited through the UI.')
  if (patch.role === 'admin') throw new Error('Cannot promote to admin through the UI.')
  Object.assign(user, patch)
  if (user.role === 'requester') user.regions = []
  return clone(user)
}

export async function setActive(email, active) {
  const key = (email || '').toLowerCase()
  const user = users.find((u) => u.email === key)
  if (!user) throw new Error('User not found.')
  if (user.seeded) throw new Error('Seeded admins cannot be deactivated through the UI.')
  if (!active && user.role === 'admin' && activeAdmins().length <= 1)
    throw new Error('Cannot deactivate the last active admin.')
  user.active = active
  return clone(user)
}