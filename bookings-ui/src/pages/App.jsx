import { useState, useEffect, useMemo } from 'react'
import './App.css'
import { REGIONS, REGION_BUILD_CAPACITY } from '../lib/bookings'
import { getCompany, activeEnvironments, listCompanies } from '../lib/servicenow'
import { allowedStartTimes, formatSlot } from '../lib/operatingHours'
import { notifyApproversForBooking } from '../lib/notifications'

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

const CSM_EMAILS = [
  // example //
  "rwhalen@strategy.com",
  // -- Anibal Sampalione --
  "falterleib@microstrategy.com",
  "fsastre@microstrategy.com",
  "mfidalgo@microstrategy.com",
  "lguglialmelli@microstrategy.com",
  "smartino@microstrategy.com",
  "edgarcia@microstrategy.com",
  // -- David Underwood --
  "cnagelschmitz@microstrategy.com",
  "yvanchenko@microstrategy.com",
  "mrielau@microstrategy.com",
  "omarchal@microstrategy.com",
  "wcruz@microstrategy.com",
  "vsolignac@microstrategy.com",
  "dpaschoud@microstrategy.com",
  // -- Francesca Laurie --
  "cpisonero@microstrategy.com",
  "jhlee@microstrategy.com",
  "svadgama@microstrategy.com",
  "frausell@strategy.com",
  "ksakamoto@microstrategy.com",
  "pasingh@microstrategy.com",
  "alacuna@microstrategy.com",
  // -- Jane Hall --
  "mscaggs@microstrategy.com",
  "rlam@microstrategy.com",
  "ngerontiev@microstrategy.com",
  "dstout@microstrategy.com",
  "mbanos@microstrategy.com",
  "anogalpoziombka@microstrategy.com",
  "togrady@microstrategy.com",
  "kforth@microstrategy.com",
  // -- Neeraj Bindra --
  "mharouaka@microstrategy.com",
  "nskees@microstrategy.com",
  "jheagerty@microstrategy.com",
  "gpullis@microstrategy.com",
  "epayne@microstrategy.com",
  // -- Zeena Husayni --
  "asampalione@microstrategy.com",
  "csegal@microstrategy.com",
  "tmiekisz@microstrategy.com",
  "lkirzner@microstrategy.com",
  "lneslin@microstrategy.com",
  // -- Sunil Vadgama --
  "pkaushal@microstrategy.com",
  "ptidke@microstrategy.com",
  "snaik@microstrategy.com",
  "alambat@microstrategy.com",
  "sveer@microstrategy.com",
  // -- Veronica Solignac --
  "bcolin@microstrategy.com",
  "abhagat@microstrategy.com",
  "jfaulknerjones@microstrategy.com",
  "aburns@microstrategy.com",
  // -- More teams --
  "aupadhyay@microstrategy.com",
  // -- Internal --
  "ctmoperations@strategyInternal.com",
  // -- Other CSMs --
  "miyamamoto@microstrategy.com",
  "bbahia@microstrategy.com",
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

  // details
  const [bookerName, setBookerName] = useState("")
  const [csmEmail, setCsmEmail] = useState("")
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

  // How many builds occupy a given region on a given calendar day. A build
  // occupies its whole 5-business-day span, not just its start date.
  const buildCountOnDay = (region, day) => {
    const iso = fmtISO(day)
    let n = 0
    for (const b of existing) {
      if (b.region !== region || b.op !== "build" || !b.start) continue
      const span = businessDaysFrom(parseISO(b.start), OPERATION_TYPES.build.spanBusinessDays)
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
  const freeSlots = regionSlots.filter((s) => !takenSet.has(s))

  const selectedEnv = company && environmentId
    ? company.environments.find((e) => e.environmentId === environmentId)
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
    }
    setManualEntry(false)
  }

  const onSelectCompany = async (selCid) => {
    const c = await getCompany(selCid)
    setCompany(c)
    setCid(c?.cid ?? "")
    setEntitlement(c?.entitlement ?? "")
    setCompanyQuery(c ? `${c.name} · ${c.cid}` : "")
    setEnvironment("")
    setEnvironmentId("")
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

  const onSelectEnvironment = (envId) => {
    const env = company?.environments.find((e) => e.environmentId === envId)
    if (!env) return
    setEnvironment(env.environment)
    setEnvironmentId(env.environmentId)
    // SNOW knows the tier — adopt it for refresh sizing when it's present.
    if (env.tier && operationType === "refresh") setTier(env.tier)
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
      }
      return true
    }
    // timed ops (refresh / cutover): respect lead time
    if (day < addDays(startOfToday(), leadDaysFor(operationType, day))) return false
    if (region) {
      const slots = slotsFor(region, operationType, hours)
      const taken = takenSlots(region, day)
      if (slots.length > 0 && slots.every((s) => taken.has(s))) return false
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
      companyName: company?.name ?? null,
      entitlement, cid, environment, environmentId,
      hostRegion: selectedEnv?.hostRegion ?? null,   // from SNOW — seeds the safe-harbour check
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
      company_id: cid || null,
      environment_id: environmentId || null,
      environment_name: environment || null,
      host_region: payload.hostRegion,
      notes: privateNotes || null,
      requester_email: csmEmail || null,
      requester_name: bookerName || null,
    }

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingBody),
      })
      if (res.ok) {
        alert("Booking saved!")
        loadBookings()   // refresh capacity so the calendar reflects this booking
      } else {
        alert("Server responded with status " + res.status)
      }
    } catch (err) {
      alert("Booking submitted (notification logged). Backend unreachable — see console.")
      console.error(err)
    }
  }

  const canBook = !!operationType && !!region && !!date && (!cfg.pickTime || !!time)

  const linkBtn = { background: "none", border: "none", color: "#3a5bbf", cursor: "pointer", padding: 0, fontSize: "0.85em" }
  const comboList = { position: "absolute", left: 0, right: 0, top: "100%", zIndex: 20, marginTop: 2, maxHeight: 220, overflowY: "auto", background: "#fff", border: "1px solid #cdd6e4", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }
  const comboItem = { display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderBottom: "1px solid #eef1f6", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }

  return (
    <>
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
          {company && (
            <div className="tz" style={{ marginTop: 4 }}>
              {activeEnvironments(company).length} active environment(s) found in ServiceNow
            </div>
          )}
        </div>

        {company && !manualEntry ? (
          <>
            <div className="field">
              <label>Environment</label>
              <select value={environmentId} onChange={(e) => onSelectEnvironment(e.target.value)}>
                <option value="">-- select an environment --</option>
                {activeEnvironments(company).map((env) => (
                  <option key={env.environmentId} value={env.environmentId}>
                    {env.environment} · {env.environmentId}
                  </option>
                ))}
              </select>
            </div>

            {selectedEnv && (
              <div className="warning-box" style={{ background: "#f2f7f0", borderColor: "#bcd4b4" }}>
                <div>Entitlement: <strong>{entitlement || "—"}</strong></div>
                <div>Environment ID: <strong>{environmentId}</strong></div>
                <div>Host region: <strong>{selectedEnv.hostRegion || "—"}</strong></div>
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
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      disabled={!selectable}
                      title={
                        buildFull ? `${region} at build capacity for this window`
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
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={taken}
                        title={taken ? "Already booked for this region / day" : undefined}
                        className={"slot" + (time === t ? " selected" : "") + (taken ? " taken" : "")}
                        onClick={() => setTime(t)}
                      >
                        {t}{taken ? " · booked" : ""}
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
            {CSM_EMAILS.map((email) => <option key={email} value={email}>{email}</option>)}
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

        <div className="book-row">
          <button type="button" className="book-btn" onClick={handleBook} disabled={!canBook}>Book</button>
        </div>
    </>
  )
}

export default App