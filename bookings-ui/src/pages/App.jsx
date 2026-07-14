import { useState, useEffect, useMemo } from 'react'
import './App.css'
import { REGIONS, REGION_BUILD_CAPACITY } from '../lib/bookings'
import { getCompany, activeEnvironments, listCompanies } from '../lib/servicenow'
import { allowedStartTimes, formatSlot } from '../lib/operatingHours'
import { notifyApproversForBooking } from '../lib/notifications'
import { listBlocks } from '../lib/blocks'
import { listRequesters } from '../lib/userStore'
import { listReservations, createReservations } from '../lib/reservations'

const OPERATION_TYPES = {
  build: {
    label: "Environment Build",
    anchor: "start",         // CSM picks the START date; build runs 5 business days forward (inclusive)
    pickTime: false,         // a multi-day span, not a time-of-day booking
    spanBusinessDays: 5,
    hoursPerDay: 8,
    leadDays: 14,            // min 2 weeks
  },
  refresh: {
    label: "MD Refresh",
    anchor: "day",
    pickTime: true,
    hoursByTier: { lower: 6, prod_large: 8 },  // 6h lower-tier, 8h PROD/large
    leadDays: 7,            // min 1 week
  },
  cutover: {
    label: "Cutover",
    anchor: "day",
    pickTime: true,
    hours: 2,
    leadDays: 7,            // min 1 week, but
    weekendLeadDays: 14,    // 2 weeks if the chosen date is a weekend
  },
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]


// --- date helpers ----------------------------------------------------------
function startOfToday() {
  const t = new Date(); t.setHours(0, 0, 0, 0); return t
}
function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}
function isWeekend(d) {
  const x = d.getDay(); return x === 0 || x === 6
}
// TZ-safe local YYYY-MM-DD (avoids the UTC day-shift; also cleaner for the
// timezone work coming later).
function fmtISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
// Parse a "YYYY-MM-DD" string as a LOCAL date (no UTC shift).
function parseISO(s) {
  if (!s) return null
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtShort(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

// Normalize a stored operation_type (either the internal key "build" or the
// display label "Environment Build") down to a canonical key.
function opKey(opType) {
  if (!opType) return null
  const v = String(opType).toLowerCase()
  if (v === "build" || v.includes("environment build")) return "build"
  if (v === "refresh" || v.includes("md refresh")) return "refresh"
  if (v === "cutover") return "cutover"
  return null
}

// The n business days starting from `startDate` (inclusive), going forward,
// skipping weekends. The start date is the first build day.
function businessDaysFrom(startDate, n) {
  const out = []
  const d = new Date(startDate)
  while (out.length < n) {
    if (!isWeekend(d)) out.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}
// Effective lead time in days for a given type + chosen date.
function leadDaysFor(type, day) {
  const cfg = OPERATION_TYPES[type]
  if (!cfg) return 0
  if (type === "cutover") return isWeekend(day) ? cfg.weekendLeadDays : cfg.leadDays
  return cfg.leadDays
}
// Total staff-hours a booking consumes.
function operationHours(type, tier) {
  if (type === "build") return OPERATION_TYPES.build.spanBusinessDays * OPERATION_TYPES.build.hoursPerDay
  if (type === "refresh") return OPERATION_TYPES.refresh.hoursByTier[tier] ?? 8
  if (type === "cutover") return OPERATION_TYPES.cutover.hours
  return 0
}
// Start label "8:30 AM" + whole hours -> end label.
function computeEndTime(startLabel, hours) {
  const m = startLabel.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return ""
  let h = parseInt(m[1], 10) % 12
  if (/PM/i.test(m[3])) h += 12
  const start = h * 60 + parseInt(m[2], 10)
  const end = start + hours * 60
  const totalH = Math.floor(end / 60)
  const eh = totalH % 24, em = end % 60     // wrap past midnight
  const nextDay = totalH >= 24
  const ampm = eh >= 12 ? "PM" : "AM"
  const dispH = ((eh + 11) % 12) + 1
  return `${dispH}:${String(em).padStart(2, "0")} ${ampm}${nextDay ? " (+1d)" : ""}`
}

// Start times available for a timed op in a region, as labels ("9:00 PM").
// Refresh + cutover are phase-2: they must finish before the region closes,
// so the window is narrowed by the operation's duration. Builds don't pick a time.
function slotsFor(region, type, durationHours) {
  if (!region || type === "build") return []
  return allowedStartTimes(region, durationHours * 60, true).map((s) => s.label)
}

function App() {
  // operation
  const [operationType, setOperationType] = useState("")  // "" | build | refresh | cutover
  const [tier, setTier] = useState("prod_large")           // refresh only: lower | prod_large

  // region — drives capacity, slot list, and the operating window the times sit in.
  const [region, setRegion] = useState("")

  // entry — ServiceNow lookup with manual fallback ("what you see is what you get")
  const [entitlement, setEntitlement] = useState("")
  const [cid, setCid] = useState("")
  const [environment, setEnvironment] = useState("")
  const [environmentId, setEnvironmentId] = useState("")
  const [companySysId, setCompanySysId] = useState("")       // SNOW account sys_id → case "account"
  const [environmentSysId, setEnvironmentSysId] = useState("") // SNOW DSI sys_id → case "u_dsi"
  const [companyQuery, setCompanyQuery] = useState("")
  const [company, setCompany] = useState(null)       // resolved SNOW company record
  const [manualEntry, setManualEntry] = useState(false)
  const [allCompanies, setAllCompanies] = useState([])  // combobox source — every company
  const [companyOpen, setCompanyOpen] = useState(false) // combobox dropdown visibility

  // calendar
  const [date, setDate] = useState(null)   // build: delivery date; refresh/cutover: operation date
  const [time, setTime] = useState("")     // start time (refresh/cutover only)
  const [viewDate, setViewDate] = useState(new Date(2026, 5, 1))

  // existing bookings — the real capacity/slot picture, loaded from the backend.
  const [bookings, setBookings] = useState([])

  // admin-set schedule blocks (per region, whole-day or single slot).
  const [blocks, setBlocks] = useState([])

  // soft holds — CSMs reserving candidate dates before committing to one.
  const [reservations, setReservations] = useState([])
  const [mode, setMode] = useState("book")          // "book" | "reserve"
  const [reserveSlots, setReserveSlots] = useState([])   // [{date, time}]
  const [reserveReason, setReserveReason] = useState("")
  const [fromGroupId, setFromGroupId] = useState(null)   // converting a hold

  // details
  const [bookerName, setBookerName] = useState("")
  const [csmEmail, setCsmEmail] = useState("")
  const [csmEmails, setCsmEmails] = useState([])
  const [utilityBox, setUtilityBox] = useState("")
  const [privateNotes, setPrivateNotes] = useState("")

  // Load the full company list once so the dropdown shows options before typing.
  useEffect(() => { listCompanies().then(setAllCompanies) }, [])

  // Load existing bookings so the calendar can gray out full days.
  const loadBookings = () =>
    fetch("/api/bookings")
      .then((r) => (r.ok ? r.json() : []))
      .then(setBookings)
      .catch(() => {})
  useEffect(() => { loadBookings() }, [])

  // Load schedule blocks so the calendar can gray out blocked days/slots.
  useEffect(() => { listBlocks().then(setBlocks).catch(() => {}) }, [])

  const loadReservations = () => listReservations().then(setReservations).catch(() => {})
  useEffect(() => { loadReservations() }, [])
  useEffect(() => { listRequesters().then(setCsmEmails).catch(() => {}) }, [])

  // Normalize backend rows (snake_case) to the shape the calendar logic needs.
  // Cancelled / rejected bookings don't occupy capacity.
  const existing = useMemo(
    () =>
      (bookings || [])
        .map((b) => ({
          region: b.region,
          op: opKey(b.operation_type),
          start: b.scheduled_date,
          startTime: b.scheduled_time,
          status: b.status,
        }))
        .filter((b) => b.status !== "cancelled" && b.status !== "rejected"),
    [bookings]
  )

  // A block spans blockDate..endDate (inclusive). ISO strings compare lexically.
  const blockCovers = (bl, iso) => iso >= bl.blockDate && iso <= (bl.endDate || bl.blockDate)

  // Whole-day block on a region for a given day?
  const wholeDayBlocked = (region, day) => {
    if (!region) return false
    const iso = fmtISO(day)
    return blocks.some((bl) => blockCovers(bl, iso) && !bl.blockTime && bl.regions.includes(region))
  }

  // Slot-level blocked times for a region + day. A timed block applies to that
  // slot on every day in its range.
  const blockedSlots = (region, day) => {
    const iso = fmtISO(day)
    return new Set(
      blocks
        .filter((bl) => blockCovers(bl, iso) && bl.blockTime && bl.regions.includes(region))
        .map((bl) => bl.blockTime)
    )
  }

  // Live holds belonging to someone other than the current CSM. Your own holds
  // never block you — converting one into a booking is the whole point.
  const othersHolds = useMemo(
    () => reservations.filter((r) => r.requesterEmail.toLowerCase() !== (csmEmail || "").toLowerCase()),
    [reservations, csmEmail]
  )

  // Slots another CSM is holding for a region + day.
  const reservedSlots = (region, day) => {
    const iso = fmtISO(day)
    return new Set(
      othersHolds
        .filter((r) => r.region === region && r.date === iso && r.time)
        .map((r) => r.time)
    )
  }

  // Your own live holds, newest group first — offered as a shortcut on the form.
  const myHolds = useMemo(
    () => reservations.filter((r) => r.requesterEmail.toLowerCase() === (csmEmail || "").toLowerCase()),
    [reservations, csmEmail]
  )

  // How many builds occupy a given region on a given calendar day. A build
  // occupies its whole 5-business-day span, not just its start date.
  // Reserved builds consume capacity exactly like real ones — otherwise another
  // CSM books straight over the hold. Only *other* CSMs' holds count, so your
  // own candidate dates never lock you out of booking them.
  const buildCountOnDay = (region, day) => {
    const iso = fmtISO(day)
    let n = 0
    for (const b of existing) {
      if (b.region !== region || b.op !== "build" || !b.start) continue
      const span = businessDaysFrom(parseISO(b.start), OPERATION_TYPES.build.spanBusinessDays)
      if (span.some((d) => fmtISO(d) === iso)) n++
    }
    for (const r of othersHolds) {
      if (r.region !== region || opKey(r.operationType) !== "build" || !r.date) continue
      const span = businessDaysFrom(parseISO(r.date), OPERATION_TYPES.build.spanBusinessDays)
      if (span.some((d) => fmtISO(d) === iso)) n++
    }
    return n
  }

  // Slots already taken (timed ops) for a region + day, from real bookings.
  const takenSlots = (region, day) => {
    const iso = fmtISO(day)
    return new Set(
      existing
        .filter((b) => b.region === region && b.op !== "build" && b.start === iso && b.startTime)
        .map((b) => b.startTime)
    )
  }

  const cfg = operationType ? OPERATION_TYPES[operationType] : null
  const hours = operationType ? operationHours(operationType, tier) : 0
  const buildSpan = operationType === "build" && date ? businessDaysFrom(date, cfg.spanBusinessDays) : []
  const endTime = cfg && cfg.pickTime && time ? computeEndTime(time, hours) : ""

  // Slots come from the region's operating hours, narrowed by the op duration.
  const regionSlots = region && cfg?.pickTime ? slotsFor(region, operationType, hours) : []
  const takenSet = region && date && cfg?.pickTime ? takenSlots(region, date) : new Set()
  const blockedSet = region && date && cfg?.pickTime ? blockedSlots(region, date) : new Set()
  const reservedSet = region && date && cfg?.pickTime ? reservedSlots(region, date) : new Set()
  const freeSlots = regionSlots.filter(
    (s) => !takenSet.has(s) && !blockedSet.has(s) && !reservedSet.has(s)
  )

  const selectedEnv = company && environmentSysId
    ? company.environments.find((e) => e.sys_id === environmentSysId)
    : null

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  const firstWeekday = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()

  // Picking a new operation type clears any date/time that may no longer be valid.
  const onTypeChange = (t) => {
    setOperationType(t)
    setDate(null)
    setTime("")
    if (t !== "refresh") setTier("prod_large")
  }

  // Changing region can invalidate the chosen slot/date (different window,
  // now taken, or over capacity) — clear both so nothing invalid stays selected.
  const onRegionChange = (r) => {
    setRegion(r)
    setTime("")
    setDate(null)
  }

  // --- Company combobox: type to filter, or pick from the list ---
  // Filtered list: everything when the box is empty (so the CSM sees what's
  // available), narrowing as they type. Matches name or CID, case-insensitive.
  const companyMatches = (() => {
    const q = companyQuery.trim().toLowerCase()
    if (q === "" || company) return allCompanies
    return allCompanies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.cid.toLowerCase().includes(q)
    )
  })()

  // Typing edits the query and deselects any resolved company so stale SNOW
  // values don't linger. No match just leaves `company` null, which keeps the
  // manual fields below visible — the seamless fallback.
  const onCompanyInput = (value) => {
    setCompanyQuery(value)
    setCompanyOpen(true)
    if (company) {
      setCompany(null)
      setEntitlement(""); setEnvironment(""); setEnvironmentId("")
      setCompanySysId(""); setEnvironmentSysId("")
    }
    setManualEntry(false)
  }

  const onSelectCompany = async (selCid) => {
    const c = await getCompany(selCid)
    setCompany(c)
    setCid(c?.cid ?? "")
    setCompanySysId(c?.sys_id ?? "")
    setCompanyQuery(c ? `${c.name} · ${c.cid}` : "")
    setEnvironment("")
    setEnvironmentId("")
    setEnvironmentSysId("")
    setManualEntry(false)
  }

  const pickCompany = (selCid) => {
    onSelectCompany(selCid)
    setCompanyOpen(false)
  }

  // Enter selects the only/first match; Escape closes the list.
  const onCompanyKeyDown = (e) => {
    if (e.key === "Escape") { setCompanyOpen(false); return }
    if (e.key === "Enter" && companyOpen && companyMatches.length > 0) {
      e.preventDefault()
      pickCompany(companyMatches[0].cid)
    }
  }

  const onSelectEnvironment = (sysId) => {
    const env = company?.environments.find((e) => e.sys_id === sysId)
    if (!env) return
    setEnvironmentSysId(env.sys_id)
    setEnvironmentId(env.dsiNumber)     // human "I-134845"
    setEnvironment(env.displayName)
  }

  // Is `day` a valid choice given the selected operation type?
  function isSelectable(day) {
    if (!operationType) return false
    if (day < startOfToday()) return false
    // Refresh defaults to weekdays only — the doc gives no weekend provision
    // for refresh (only cutover names one).
    if (operationType === "refresh" && isWeekend(day)) return false
    if (operationType === "build") {
      // Build starts on the selected day and runs 5 business days forward, so
      // the start must be a weekday and at least 2 weeks out.
      if (isWeekend(day)) return false
      if (day < addDays(startOfToday(), cfg.leadDays)) return false
      // Capacity: the new build's 5-day span must not push any day it covers
      // past the region's build capacity.
      if (region) {
        const cap = REGION_BUILD_CAPACITY[region] ?? Infinity
        const span = businessDaysFrom(day, cfg.spanBusinessDays)
        if (span.some((d) => buildCountOnDay(region, d) >= cap)) return false
        // A whole-day block anywhere in the span rules the start out.
        if (span.some((d) => wholeDayBlocked(region, d))) return false
      }
      return true
    }
    // timed ops (refresh / cutover): respect lead time
    if (day < addDays(startOfToday(), leadDaysFor(operationType, day))) return false
    if (region) {
      // A whole-day block rules the day out entirely.
      if (wholeDayBlocked(region, day)) return false
      const slots = slotsFor(region, operationType, hours)
      const taken = takenSlots(region, day)
      const blocked = blockedSlots(region, day)
      const held = reservedSlots(region, day)
      // Day is unusable if every slot is taken, blocked, or held by another CSM.
      if (slots.length > 0 && slots.every((s) => taken.has(s) || blocked.has(s) || held.has(s))) return false
    }
    return true
  }

  const inBuildSpan = (day) => buildSpan.some((s) => s.toDateString() === day.toDateString())

  const FLOW_URL = import.meta.env.VITE_FLOW_URL

    const handleBook = async () => {
    const payload = {
      operationType,
      operationLabel: cfg?.label || "",
      tier: operationType === "refresh" ? tier : null,
      durationHours: hours,
      region,
      companyName: company?.name ?? (companyQuery.trim() || null),
      entitlement, cid, environment, environmentId,
      buildWindowStart: operationType === "build" && buildSpan.length ? fmtISO(buildSpan[0]) : null,
      buildWindowEnd: operationType === "build" && buildSpan.length ? fmtISO(buildSpan[buildSpan.length - 1]) : null,
      date: operationType !== "build" && date ? fmtISO(date) : null,
      startTime: cfg?.pickTime ? time : null,   // US Eastern — the single anchor for all bookings
      endTime: endTime || null,
      bookerName, csmEmail, utilityBox, privateNotes,
    }

    console.log("Booking payload:", payload)

    // Notify approvers on submit. Independent of the Power Automate flow,
    // which is blocked by tenant OAuth policy — stubbed sends log to console.
    notifyApproversForBooking({
      ...payload,
      title: payload.companyName || payload.operationLabel,
      start: payload.date || payload.buildWindowStart,
      end: payload.date || payload.buildWindowEnd,
      submittedBy: payload.csmEmail,
    })

    const bookingBody = {
      operation_type: operationType,
      region,
      scheduled_date: operationType === "build"
        ? payload.buildWindowStart
        : payload.date,
      scheduled_time: payload.startTime ?? "",
      company_name: payload.companyName,
      company_id: companySysId || null,          // SNOW account sys_id → case "account"
      cid: cid || null,
      environment_id: environmentSysId || null,  // SNOW DSI sys_id → case "u_dsi"
      environment_name: environment || null,
      host_region: null,                         // no host-region field in SNOW
      notes: privateNotes || null,
      requester_email: csmEmail || null,
      requester_name: bookerName || null,
      // Booking a held date releases the whole candidate set in one transaction.
      reservation_group_id: fromGroupId,
    }

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingBody),
      })
      if (res.ok) {
        alert("Booking saved!")
        setFromGroupId(null)
        loadBookings()      // refresh capacity so the calendar reflects this booking
        loadReservations()  // the converted group is now released
      } else {
        let detail = "status " + res.status
        try { detail = (await res.json()).detail || detail } catch {}
        alert("Booking failed — " + detail)
      }
    } catch (err) {
      alert("Booking submitted (notification logged). Backend unreachable — see console.")
      console.error(err)
    }
  }

  // --- reserve mode ---------------------------------------------------------
  const slotKey = (sl) => `${sl.date}|${sl.time || ""}`

  const addCandidate = () => {
    if (!date) return
    const sl = { date: fmtISO(date), time: cfg?.pickTime ? time : "" }
    if (reserveSlots.some((x) => slotKey(x) === slotKey(sl))) return
    setReserveSlots([...reserveSlots, sl])
    setDate(null)
    setTime("")
  }
  const removeCandidate = (sl) =>
    setReserveSlots(reserveSlots.filter((x) => slotKey(x) !== slotKey(sl)))

  const handleReserve = async () => {
    try {
      await createReservations({
        operationType,
        region,
        slots: reserveSlots,
        companyName: company?.name ?? (companyQuery.trim() || null),
        cid: cid || null,
        reason: reserveReason,
        requesterEmail: csmEmail,
        requesterName: bookerName || null,
      })
      alert(`Reserved ${reserveSlots.length} date(s) — held for 7 days.`)
      setReserveSlots([])
      setReserveReason("")
      loadReservations()
    } catch (e) {
      alert("Reserve failed — " + e.message)
    }
  }

  // Load one of your held dates back into the form, ready to book for real.
  const useHold = (r) => {
    setMode("book")
    setFromGroupId(r.groupId)
    setOperationType(r.operationType)
    setRegion(r.region)
    setDate(parseISO(r.date))
    setTime(r.time || "")
    if (r.companyName && !companyQuery) setCompanyQuery(r.companyName)
    if (r.cid && !cid) setCid(r.cid)
  }

  const canBook = !!operationType && !!region && !!date && (!cfg.pickTime || !!time)
  const canAddCandidate = !!operationType && !!region && !!date && (!cfg?.pickTime || !!time)
  const canReserve =
    reserveSlots.length > 0 && !!csmEmail && !!reserveReason.trim() && !!operationType && !!region

  const linkBtn = { background: "none", border: "none", color: "#3a5bbf", cursor: "pointer", padding: 0, fontSize: "0.85em" }
  const comboList = { position: "absolute", left: 0, right: 0, top: "100%", zIndex: 20, marginTop: 2, maxHeight: 220, overflowY: "auto", background: "#fff", border: "1px solid #cdd6e4", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }
  const comboItem = { display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderBottom: "1px solid #eef1f6", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }

  return (
    <>
        {/* Book vs Reserve — reserve is a soft hold: no approval, expires in 7 days. */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["book", "Book"], ["reserve", "Reserve dates"]].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setFromGroupId(null) }}
              style={{
                padding: "6px 14px", fontSize: "0.85rem", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${mode === m ? "#3a5bbf" : "#cdd6e4"}`,
                background: mode === m ? "#3a5bbf" : "#fff",
                color: mode === m ? "#fff" : "#605e5c",
                fontWeight: mode === m ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "reserve" && (
          <div className="warning-box" style={{ background: "#f5f3ff", borderColor: "#c4b5fd" }}>
            <strong>Soft hold.</strong> Reserved dates aren't sent for approval — they just stop
            other CSMs booking them. They expire automatically after 7 days.
          </div>
        )}

        {mode === "book" && myHolds.length > 0 && (
          <div className="warning-box" style={{ background: "#f5f3ff", borderColor: "#c4b5fd" }}>
            <div style={{ marginBottom: 6 }}><strong>Your reserved dates</strong> — pick one to book for real:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {myHolds.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => useHold(r)}
                  style={{
                    padding: "4px 9px", fontSize: "0.78rem", borderRadius: 5, cursor: "pointer",
                    border: `1px solid ${fromGroupId === r.groupId ? "#6d28d9" : "#c4b5fd"}`,
                    background: fromGroupId === r.groupId ? "#ede9fe" : "#fff", color: "#4c1d95",
                  }}
                >
                  {fmtShort(parseISO(r.date))}{r.time ? ` · ${r.time}` : ""} · {r.region}
                  {r.companyName ? ` · ${r.companyName}` : ""}
                </button>
              ))}
            </div>
            {fromGroupId && (
              <div style={{ marginTop: 6, fontSize: "0.8rem" }}>
                Booking this releases the rest of that reserved set.{" "}
                <button type="button" onClick={() => setFromGroupId(null)} style={linkBtn}>Cancel</button>
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label>Operation type</label>
          <select value={operationType} onChange={(e) => onTypeChange(e.target.value)}>
            <option value="">-- select an option --</option>
            <option value="build">Environment Build</option>
            <option value="refresh">MD Refresh</option>
            <option value="cutover">Cutover</option>
          </select>
        </div>

        {operationType === "refresh" && (
          <div className="field">
            <label>Environment tier</label>
            <select value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="prod_large">PROD / large (8h)</option>
              <option value="lower">Lower-tier (6h)</option>
            </select>
          </div>
        )}

        <div className="field">
          <label>Region</label>
          <select value={region} onChange={(e) => onRegionChange(e.target.value)}>
            <option value="">-- select a region --</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {region && (
            <div className="tz" style={{ marginTop: 4 }}>
              Capacity &amp; available slots for {region}
              {operationType === "build" && ` · up to ${REGION_BUILD_CAPACITY[region] ?? "—"} concurrent builds`}
            </div>
          )}
        </div>

        {cfg && (
          <div className="warning-box" style={{ background: "#eef4ff", borderColor: "#9db8e8" }}>
            <strong>{cfg.label}</strong> · {hours}h
            {operationType === "build" && " across 5 business days from the start date"}
            {" · "}
            {operationType === "build" && "book at least 2 weeks ahead"}
            {operationType === "refresh" && "book at least 1 week ahead"}
            {operationType === "cutover" && "book at least 1 week ahead (2 weeks for weekend dates)"}
          </div>
        )}

        {/* --- ServiceNow company lookup (combobox: type to filter or pick) --- */}
        <div className="field" style={{ position: "relative" }}>
          <label>Company / CID</label>
          <input
            type="text"
            value={companyQuery}
            placeholder="Type to search, or pick from the list…"
            autoComplete="off"
            onChange={(e) => onCompanyInput(e.target.value)}
            onFocus={() => setCompanyOpen(true)}
            onBlur={() => setTimeout(() => setCompanyOpen(false), 120)}
            onKeyDown={onCompanyKeyDown}
          />
          {companyOpen && (
            <div style={comboList}>
              {companyMatches.length > 0 ? (
                companyMatches.map((c) => (
                  <button
                    key={c.cid}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCompany(c.cid)}
                    style={comboItem}
                  >
                    {c.name} · {c.cid}
                  </button>
                ))
              ) : (
                <div style={{ padding: "8px 10px", color: "#605e5c", fontSize: "0.85rem" }}>
                  No match — enter the details manually below.
                </div>
              )}
            </div>
          )}
          {company ? (
            <div className="tz" style={{ marginTop: 4 }}>
              {activeEnvironments(company).length} active environment(s) found in ServiceNow
            </div>
          ) : companyQuery.trim() ? (
            <div
              className="warning-box"
              style={{ background: "#fff7ed", borderColor: "#fdba74", marginTop: 6 }}
            >
              <strong>No ServiceNow match.</strong> This will be booked as{" "}
              <strong>{companyQuery.trim()}</strong> with details entered below. No ServiceNow case
              will be created on approval — an approver will need to create one manually.
            </div>
          ) : null}
        </div>

        {company && !manualEntry ? (
          <>
            <div className="field">
              <label>Environment</label>
              <select value={environmentSysId} onChange={(e) => onSelectEnvironment(e.target.value)}>
                <option value="">-- select an environment --</option>
                {activeEnvironments(company).map((env) => (
                  <option key={env.sys_id} value={env.sys_id}>
                    {env.displayName}
                  </option>
                ))}
              </select>
            </div>

            {selectedEnv && (
              <div className="warning-box" style={{ background: "#f2f7f0", borderColor: "#bcd4b4" }}>
                <div>Environment ID: <strong>{environmentId}</strong></div>
                <div>Platform: <strong>{selectedEnv.platform || "—"}</strong></div>
                <div>Version: <strong>{selectedEnv.version || "—"}</strong></div>
                {selectedEnv.cluster && <div>Cluster: <strong>{selectedEnv.cluster}</strong></div>}
              </div>
            )}

            <button type="button" onClick={() => setManualEntry(true)} style={linkBtn}>
              Can't find it? Enter manually
            </button>
          </>
        ) : (
          <>
            {company && (
              <button type="button" onClick={() => setManualEntry(false)} style={{ ...linkBtn, marginBottom: 4 }}>
                ← Use ServiceNow values
              </button>
            )}
            <div className="field">
              <label>CID</label>
              <input type="text" value={cid} onChange={(e) => setCid(e.target.value)} />
            </div>
            <div className="field">
              <label>Entitlement</label>
              <input type="text" value={entitlement} onChange={(e) => setEntitlement(e.target.value)} />
            </div>
            <div className="field">
              <label>Environment</label>
              <input type="text" value={environment} onChange={(e) => setEnvironment(e.target.value)} />
            </div>
            <div className="field">
              <label>Environment ID</label>
              <input type="text" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} />
            </div>
          </>
        )}

        <div className="field">
          <label>{operationType === "build" ? "Select a build start date" : "Select a date and time"}</label>
          <div className="cal-row">
            <div className="cal">
              <div className="cal-head">
                <button type="button" onClick={prevMonth}>‹</button>
                <span>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                <button type="button" onClick={nextMonth}>›</button>
              </div>

              <div className="cal-grid">
                {DOW.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
                {Array.from({ length: firstWeekday }).map((_, i) => <div key={"blank" + i} />)}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1
                  const thisDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNum)
                  const selectable = isSelectable(thisDay)
                  const selected = date && date.toDateString() === thisDay.toDateString()
                  const span = operationType === "build" && inBuildSpan(thisDay)
                  // Explain a disabled build day: at/over capacity vs other reasons.
                  const buildFull =
                    operationType === "build" && region && !selectable && !isWeekend(thisDay) &&
                    thisDay >= addDays(startOfToday(), cfg.leadDays) &&
                    businessDaysFrom(thisDay, cfg.spanBusinessDays).some(
                      (d) => buildCountOnDay(region, d) >= (REGION_BUILD_CAPACITY[region] ?? Infinity)
                    )
                  // Explain a disabled day caused by an admin block.
                  const dayBlocked =
                    region && !selectable && (
                      operationType === "build"
                        ? businessDaysFrom(thisDay, cfg.spanBusinessDays).some((d) => wholeDayBlocked(region, d))
                        : wholeDayBlocked(region, thisDay)
                    )
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      disabled={!selectable}
                      title={
                        dayBlocked ? `Blocked for ${region}`
                        : buildFull ? `${region} at build capacity for this window (bookings or held dates)`
                        : span ? "Reserved build day"
                        : undefined
                      }
                      className={"cal-day" + (selected ? " selected" : "")}
                      style={span ? { background: "#dce7fb", borderColor: "#9db8e8" } : undefined}
                      onClick={() => { setDate(thisDay); setTime("") }}
                    >
                      {dayNum}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="cal-times">
              {!operationType ? (
                <div className="cal-hint">Select an operation type first.</div>
              ) : !date ? (
                <div className="cal-hint">
                  {operationType === "build" ? "Select a build start date." : "Select a date to see start times."}
                </div>
              ) : operationType === "build" ? (
                <div className="cal-hint">
                  <div><strong>Build window</strong></div>
                  <div>{buildSpan.length ? `${fmtShort(buildSpan[0])} – ${fmtShort(buildSpan[buildSpan.length - 1])}` : ""}</div>
                  <div style={{ marginTop: 6, fontSize: "0.85em" }}>5 business days · starts {fmtShort(date)}</div>
                </div>
              ) : !region ? (
                <div className="cal-hint">Select a region to see start times.</div>
              ) : (
                <>
                  <div className="cal-hint" style={{ marginBottom: 8 }}>
                    <strong>{freeSlots.length}</strong> of {regionSlots.length} slots free on {fmtShort(date)}
                  </div>
                  {regionSlots.map((t) => {
                    const taken = takenSet.has(t)
                    const blocked = blockedSet.has(t)
                    const held = reservedSet.has(t)
                    const already = reserveSlots.some((x) => x.date === fmtISO(date) && x.time === t)
                    const disabled = taken || blocked || held
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        title={
                          blocked ? "Blocked by an admin"
                          : held ? "Reserved by another CSM"
                          : taken ? "Already booked for this region / day"
                          : undefined
                        }
                        className={"slot" + (time === t ? " selected" : "") + (disabled ? " taken" : "")}
                        style={already ? { borderColor: "#8b5cf6", background: "#f5f3ff" } : undefined}
                        onClick={() => setTime(t)}
                      >
                        {t}{blocked ? " · blocked" : held ? " · reserved" : taken ? " · booked" : already ? " · added" : ""}
                      </button>
                    )
                  })}
                  {regionSlots.length === 0 && (
                    <div className="cal-hint">
                      No valid start times — a {hours}h {cfg.label.toLowerCase()} doesn't fit {region}'s operating hours.
                    </div>
                  )}
                  {time && (
                    <div className="cal-hint" style={{ marginTop: 8 }}>
                      {hours}h · {time} – {endTime}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="tz">All times are in (UTC−05:00) Eastern Time (US &amp; Canada)</div>
        </div>

        <h3 className="section-head">Your details</h3>

        <div className="field">
          <label>Your Name</label>
          <input type="text" value={bookerName} onChange={(e) => setBookerName(e.target.value)} />
        </div>

        <div className="field">
          <label>CSM email address</label>
          <select value={csmEmail} onChange={(e) => setCsmEmail(e.target.value)}>
            <option value="">-- select an option --</option>
            {csmEmails.map((email) => <option key={email} value={email}>{email}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Utility box upgrade?</label>
          <select value={utilityBox} onChange={(e) => setUtilityBox(e.target.value)}>
            <option value="">-- select an option --</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>

        <div className="field">
          <label>Private notes (optional)</label>
          <textarea value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} />
        </div>

        {mode === "reserve" && (
          <>
            <div className="field">
              <label>Why are these dates being held?</label>
              <textarea
                value={reserveReason}
                onChange={(e) => setReserveReason(e.target.value)}
                placeholder="e.g. Awaiting customer confirmation on the cutover window"
              />
            </div>

            <div className="field">
              <label>Candidate dates ({reserveSlots.length})</label>
              <button
                type="button"
                onClick={addCandidate}
                disabled={!canAddCandidate}
                style={{ ...linkBtn, fontSize: "0.85rem", opacity: canAddCandidate ? 1 : 0.5 }}
              >
                + Add the selected date{cfg?.pickTime ? " & time" : ""}
              </button>
              {reserveSlots.length === 0 ? (
                <div className="cal-hint" style={{ marginTop: 6 }}>
                  Pick a date above{cfg?.pickTime ? " and a start time" : ""}, then add it. Repeat for
                  each date you want to hold.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {reserveSlots.map((sl) => (
                    <span
                      key={slotKey(sl)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px",
                        borderRadius: 5, fontSize: "0.78rem", background: "#f5f3ff",
                        border: "1px solid #c4b5fd", color: "#4c1d95",
                      }}
                    >
                      {fmtShort(parseISO(sl.date))}{sl.time ? ` · ${sl.time}` : ""}
                      <button
                        type="button"
                        onClick={() => removeCandidate(sl)}
                        style={{ ...linkBtn, color: "#6d28d9", fontSize: "1rem", lineHeight: 1 }}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="book-row">
          {mode === "book" ? (
            <button type="button" className="book-btn" onClick={handleBook} disabled={!canBook}>
              Book
            </button>
          ) : (
            <button type="button" className="book-btn" onClick={handleReserve} disabled={!canReserve}>
              Reserve {reserveSlots.length || ""} date{reserveSlots.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
    </>
  )
}

export default App