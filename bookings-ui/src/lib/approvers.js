// approvers.js

const APPROVER_EMAILS = [
  'rwhalen@strategy.com'
]

/** @param {string} email */
export function isApprover(email) {
  return APPROVER_EMAILS.includes(email?.toLowerCase())
}

export { APPROVER_EMAILS }