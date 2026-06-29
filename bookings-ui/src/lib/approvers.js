// approvers.js
//
// Each approver maps to the region(s) they may approve. Region codes match
// bookings.js: CLD-HQ, CLD-CTC, CLD-EMEA. '*' means all regions.
//
// In production this is the approvers table (or an Entra group/claim) — the
// region comes from the approver's record, not from anything the client asserts.
const APPROVERS = {
  'rwhalen@strategy.com': { regions: ['CLD-HQ'] },        
  'theboss@example.com':  { regions: ['*'] },            
}

export function isApprover(email) {
  return !!APPROVERS[email?.toLowerCase()]
}

/** Regions this approver may act on. '*' = all. */
export function approverRegions(email) {
  return APPROVERS[email?.toLowerCase()]?.regions ?? []
}

export function canApproveRegion(email, region) {
  const regions = approverRegions(email)
  return regions.includes('*') || regions.includes(region)
}

export const APPROVER_EMAILS = Object.keys(APPROVERS)