export const REGIONS = ["CLD-CTC", "CLD-EMEA", "CLD-HQ"]

export const REGION_BUILD_CAPACITY = {
  "CLD-CTC": 2,
  "CLD-EMEA": 4,
  "CLD-HQ": 3,
}

export const SEED_BOOKINGS = []

// Map a booking-form payload into a calendar record. This is the seam between
// the two surfaces — when create writes to the shared store, it runs through here.
export function fromFormPayload(p, id) {
  const isBuild = p.operationType === "build"
  return {
    id,
    status: "pending",
    region: null, // assignment / region is decided later (manager step, TBD)
    operationType: p.operationType,
    operationLabel: p.operationLabel,
    title: p.operationLabel,
    cid: p.cid,
    environment: p.environment,
    environmentId: p.environmentId,
    start: isBuild ? p.buildWindowStart : p.date,
    end: isBuild ? p.buildWindowEnd : p.date,
    startTime: p.startTime,
    endTime: p.endTime,
    durationHours: p.durationHours,
    tier: p.tier,
    bookerName: p.bookerName,
    csmEmail: p.csmEmail,
    utilityBox: p.utilityBox,
    privateNotes: p.privateNotes,
  }
}

export const REGION_TZ = {
  "CLD-CTC":  "Asia/Shanghai",
  "CLD-EMEA": "Europe/London",
  "CLD-HQ":   "America/New_York",
}

// Region-local wall-clock slots — vary the count per region freely.
export const REGION_SLOTS = {
  "CLD-CTC":  ["9:00 AM", "10:30 AM", "1:00 PM"],                       // 3/day
  "CLD-EMEA": ["8:30 AM", "10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM"],// 5/day
  "CLD-HQ":   ["8:30 AM", "10:00 AM", "11:30 AM", "1:00 PM"],           // 4/day
}