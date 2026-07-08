// Cloud-support roster. Backend returns [{name, email, region}] already in the
// display shape, so no case-mapping needed. Region filter is optional.
export async function listEmployees(region) {
  const url = region ? `/api/employees?region=${encodeURIComponent(region)}` : '/api/employees'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load employees (${res.status})`)
  return res.json()
}