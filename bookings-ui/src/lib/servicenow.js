// serviceNow.js
// Lookups hit the backend, which proxies ServiceNow server-side.

// Fetches the full company list once. The combobox filters this client-side,
// per the design (no backend search-by-fragment endpoint).
async function fetchAllCompanies() {
  const res = await fetch('/api/companies')
  if (!res.ok) throw new Error('Failed to load companies')
  return await res.json() // [{ cid, name }]
}

// Returns [{ cid, name }] matching a name or CID fragment.
export async function searchCompanies(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const companies = await fetchAllCompanies()
  return companies.filter(
    (c) => c.name.toLowerCase().includes(q) || c.cid.toLowerCase().includes(q)
  )
}

// Returns [{ cid, name }] for every company, name-sorted.
export async function listCompanies() {
  const companies = await fetchAllCompanies()
  return companies.sort((a, b) => a.name.localeCompare(b.name))
}

// Returns the full company record (with environments) for a CID, or null.
export async function getCompany(cid) {
  const res = await fetch(`/api/companies/${encodeURIComponent(cid)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load company')
  return await res.json() // { cid, name, environments: [...] }
}

// The "what you see" list — active environments only.
export function activeEnvironments(company) {
  if (!company) return []
  return company.environments.filter((e) => e.status === 'active')
}