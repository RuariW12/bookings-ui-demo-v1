// Admins are seeded here and checked first. Region is informational
// (which region they own) — admins are global in capability.
const adminIdentities = {
  'rwhalen@strategy.com': { regions: ['CLD-HQ'] },
}


// Manager Approval Identities
const approverIdentities = {
};



// CSM Requester Identities
const requesterIdentities = {
};



// Lookup functions for auth.jsx
export function resolveUser(email) {
  const key = email.toLowerCase()
  if (adminIdentities[key]) {
    return { role: 'admin', regions: adminIdentities[key].regions }
  }
  if (approverIdentities[key]) {
    return { role: 'approver', regions: approverIdentities[key].regions }
  }
  if (requesterIdentities[key]) {
    return { role: 'requester', regions: [] }
  }
  return null
}

export function canApproveRegion(email, region) {
  const user = resolveUser(email);
  if (!user) return false;
  // Admins are region-scoped super-approvers; approvers are region-scoped.
  // '*' means all regions. Mirrors the backend guard.
  if (user.role !== 'approver' && user.role !== 'admin') return false;
  return user.regions.includes('*') || user.regions.includes(region);
}

// which approvers get notified for a bookings region
export function approversForRegion(region) {
  return Object.entries(approverIdentities)
    .filter(([, v]) => v.regions.includes('*') || v.regions.includes(region))
    .map(([email]) => email)
}