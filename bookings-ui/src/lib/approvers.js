// approvers.js
//
// Each approver maps to the region(s) they may approve. Region codes match
// bookings.js: CLD-HQ, CLD-CTC, CLD-EMEA. '*' means all regions.
//
// In production this is the approvers table (or an Entra group/claim) — the
// region comes from the approver's record, not from anything the client asserts.
const APPROVERS = {
  'rwhalen@strategy.com': { regions: ['CLD-HQ'] },        // HQ manager — HQ cases only
  'theboss@example.com':  { regions: ['*'] },             // covers every region
}

/** @param {string} email */
export function isApprover(email) {
  return !!APPROVERS[email?.toLowerCase()]
}

/** Regions this approver may act on. '*' = all. */
export function approverRegions(email) {
  return APPROVERS[email?.toLowerCase()]?.regions ?? []
}

/** Can this approver approve a booking in `region`? */
export function canApproveRegion(email, region) {
  const regions = approverRegions(email)
  return regions.includes('*') || regions.includes(region)
}

// Back-compat for any older imports.
export const APPROVER_EMAILS = Object.keys(APPROVERS)