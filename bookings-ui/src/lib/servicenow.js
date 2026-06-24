// serviceNow.js
// Mock of the ServiceNow CMDB lookups the booking form needs.

export const SNOW_COMPANIES = [
  {
    cid: "C560",
    name: "Northwind Trading Co.",
    entitlement: "ENT-560-PLATINUM",
    environments: [
      { environmentId: "ENV-560-PRD", environment: "PROD", tier: "prod_large", hostRegion: "CLD-EMEA", status: "active" },
      { environmentId: "ENV-560-QA",  environment: "QA",   tier: "lower",      hostRegion: "CLD-EMEA", status: "active" },
      { environmentId: "ENV-560-DEV", environment: "DEV",  tier: "lower",      hostRegion: "CLD-EMEA", status: "decommissioned" },
    ],
  },
  {
    cid: "C689",
    name: "Contoso Logistics",
    entitlement: "ENT-689-GOLD",
    environments: [
      // host region varies per environment — this is the seed for the safe-harbour check later.
      { environmentId: "ENV-689-PRD", environment: "PROD", tier: "prod_large", hostRegion: "CLD-EMEA", status: "active" },
      { environmentId: "ENV-689-UAT", environment: "UAT",  tier: "lower",      hostRegion: "CLD-CTC",  status: "active" },
      { environmentId: "ENV-689-QA",  environment: "QA",   tier: "lower",      hostRegion: "CLD-CTC",  status: "active" },
    ],
  },
  {
    cid: "C802",
    name: "Fabrikam Health",
    entitlement: "ENT-802-PLATINUM",
    environments: [
      { environmentId: "ENV-802-PRD", environment: "PROD", tier: "prod_large", hostRegion: "CLD-HQ", status: "active" },
      { environmentId: "ENV-802-DEV", environment: "DEV",  tier: "lower",      hostRegion: "CLD-HQ", status: "active" },
      // missing tier — record came in incomplete. Form leaves the tier select on its default.
      { environmentId: "ENV-802-SBX", environment: "SBX",  tier: null,         hostRegion: "CLD-HQ", status: "active" },
    ],
  },
  {
    cid: "C757",
    name: "Tailspin Media",
    entitlement: "ENT-757-SILVER",
    environments: [
      { environmentId: "ENV-757-PRD", environment: "PROD", tier: "prod_large", hostRegion: "CLD-HQ", status: "active" },
      { environmentId: "ENV-757-DEV", environment: "DEV",  tier: "lower",      hostRegion: "CLD-HQ", status: "active" },
    ],
  },
  {
    cid: "C701",
    name: "Adventure Works",
    entitlement: "ENT-701-GOLD",
    environments: [
      { environmentId: "ENV-701-PRD", environment: "PROD", tier: "prod_large", hostRegion: "CLD-CTC", status: "active" },
      { environmentId: "ENV-701-DR",  environment: "DR",   tier: "prod_large", hostRegion: "CLD-CTC", status: "active" },
      { environmentId: "ENV-701-UAT", environment: "UAT",  tier: "lower",      hostRegion: "CLD-CTC", status: "decommissioned" },
    ],
  },
  {
    cid: "C702",
    name: "Wingtip Finance",
    entitlement: "ENT-702-SILVER",
    environments: [
      { environmentId: "ENV-702-PRD", environment: "PROD", tier: "prod_large", hostRegion: "CLD-CTC", status: "active" },
      { environmentId: "ENV-702-SBX", environment: "SBX",  tier: "lower",      hostRegion: "CLD-CTC", status: "active" },
    ],
  },
]

// --- lookup API (swap bodies for real SNOW calls when OAuth lands) ---------

// Returns [{ cid, name }] for companies matching a name or CID fragment.
// Real version: GET the company/account table with a name/number query.
export async function searchCompanies(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SNOW_COMPANIES
    .filter((c) => c.name.toLowerCase().includes(q) || c.cid.toLowerCase().includes(q))
    .map((c) => ({ cid: c.cid, name: c.name }))
}

// Returns the full company record (with environments) for a CID, or null.
// Real version: GET the company, then its related CMDB environment CIs.
export async function getCompany(cid) {
  return SNOW_COMPANIES.find((c) => c.cid === cid) ?? null
}

// The "what you see" list — active environments only.
export function activeEnvironments(company) {
  if (!company) return []
  return company.environments.filter((e) => e.status === "active")
}