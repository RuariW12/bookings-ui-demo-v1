import { useState } from 'react'
import './App.css'

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
    leadDays: 7,            // min 1 week, but...
    weekendLeadDays: 14,    // ...2 weeks if the chosen date is a weekend
  },
}

const DAILY_CAPACITY_HOURS = null            
const EXISTING_BOOKINGS = []                 

function dayCapacityReached(/* day */) {
  if (DAILY_CAPACITY_HOURS == null) return false   // unknown → never block (stub)
  return false
}

const SLOTS = ["8:30 AM", "10:00 AM", "11:30 AM", "1:00 PM"]
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
function fmtShort(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
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
  const eh = Math.floor(end / 60), em = end % 60
  const ampm = eh >= 12 ? "PM" : "AM"
  const dispH = ((eh + 11) % 12) + 1
  return `${dispH}:${String(em).padStart(2, "0")} ${ampm}`
}

function App() {
  // operation
  const [operationType, setOperationType] = useState("")  // "" | build | refresh | cutover
  const [tier, setTier] = useState("prod_large")           // refresh only: lower | prod_large

  // entry (manual — autofill deferred until data is reliable)
  const [entitlement, setEntitlement] = useState("")
  const [cid, setCid] = useState("")
  const [environment, setEnvironment] = useState("")
  const [environmentId, setEnvironmentId] = useState("")

  // calendar
  const [date, setDate] = useState(null)   // build: delivery date; refresh/cutover: operation date
  const [time, setTime] = useState("")     // start time (refresh/cutover only)
  const [viewDate, setViewDate] = useState(new Date(2026, 5, 1))

  // details
  const [bookerName, setBookerName] = useState("")
  const [csmEmail, setCsmEmail] = useState("")
  const [utilityBox, setUtilityBox] = useState("")
  const [privateNotes, setPrivateNotes] = useState("")

  const cfg = operationType ? OPERATION_TYPES[operationType] : null
  const hours = operationType ? operationHours(operationType, tier) : 0
  const buildSpan = operationType === "build" && date ? businessDaysFrom(date, cfg.spanBusinessDays) : []
  const endTime = cfg && cfg.pickTime && time ? computeEndTime(time, hours) : ""

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

  // Is `day` a valid choice given the selected operation type?
  function isSelectable(day) {
    if (!operationType) return false
    if (day < startOfToday()) return false
    if (dayCapacityReached(day)) return false           // inert until capacity known
    // Refresh defaults to weekdays only — the doc gives no weekend provision
    // for refresh (only cutover names one). Flip this if confirmed otherwise.
    if (operationType === "refresh" && isWeekend(day)) return false
    if (operationType === "build") {
      // Build starts on the selected day and runs 5 business days forward, so
      // the start must be a weekday and at least 2 weeks out.
      if (isWeekend(day)) return false
      return day >= addDays(startOfToday(), cfg.leadDays)
    }
    return day >= addDays(startOfToday(), leadDaysFor(operationType, day))
  }

  const inBuildSpan = (day) => buildSpan.some((s) => s.toDateString() === day.toDateString())

  const FLOW_URL = import.meta.env.VITE_FLOW_URL

  const handleBook = async () => {
    const payload = {
      operationType,
      operationLabel: cfg?.label || "",
      tier: operationType === "refresh" ? tier : null,
      durationHours: hours,
      entitlement, cid, environment, environmentId,
      // date semantics differ by type. Build is START-anchored: the selected
      // date is the first of 5 business days (delivery per the doc falls on/
      // after the window end and is not captured here).
      buildWindowStart: operationType === "build" && buildSpan.length ? fmtISO(buildSpan[0]) : null,
      buildWindowEnd: operationType === "build" && buildSpan.length ? fmtISO(buildSpan[buildSpan.length - 1]) : null,
      date: operationType !== "build" && date ? fmtISO(date) : null,
      startTime: cfg?.pickTime ? time : null,
      endTime: endTime || null,
      bookerName, csmEmail, utilityBox, privateNotes,
    }

    console.log("Booking payload:", payload)

    try {
      const res = await fetch(FLOW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) alert("Booking sent!")
      else alert("Flow responded with status " + res.status)
    } catch (err) {
      alert("Couldn't reach the flow (likely CORS from localhost — check the console; the payload still logged).")
      console.error(err)
    }
  }

  const canBook = !!operationType && !!date && (!cfg.pickTime || !!time)

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

        <div className="field">
          <label>Entitlement</label>
          <input type="text" value={entitlement} onChange={(e) => setEntitlement(e.target.value)} />
        </div>

        <div className="field">
          <label>CID</label>
          <input type="text" value={cid} onChange={(e) => setCid(e.target.value)} />
        </div>

        <div className="field">
          <label>Environment</label>
          <input type="text" value={environment} onChange={(e) => setEnvironment(e.target.value)} />
        </div>

        <div className="field">
          <label>Environment ID</label>
          <input type="text" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} />
        </div>

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
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      disabled={!selectable}
                      title={span ? "Reserved build day" : undefined}
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
              ) : (
                <>
                  {SLOTS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={"slot" + (time === t ? " selected" : "")}
                      onClick={() => setTime(t)}
                    >
                      {t}
                    </button>
                  ))}
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