import { useState } from 'react'
import './App.css'
import strategyLogo from './assets/strategy.jpg'

// Environments map to their Environment ID, derived from entitlement + CID + environment.
// Each CID exposes only its own valid subset of environments.
// Full possible environment type set: PROD, DEV, UAT, QA, SBX, ADHOC, SIT, PERF, TEST, OTHER, DR
const DATA = {
  "Entitlement A": {
    "CID-1001": { "PROD": "env-1001-prod", "DEV": "env-1001-dev", "UAT": "env-1001-uat", "DR": "env-1001-dr" },
    "CID-1002": { "DEV": "env-1002-dev", "QA": "env-1002-qa", "SBX": "env-1002-sbx", "TEST": "env-1002-test" },
  },
  "Entitlement B": {
    "CID-2001": { "PROD": "env-2001-prod", "UAT": "env-2001-uat", "SIT": "env-2001-sit", "PERF": "env-2001-perf", "ADHOC": "env-2001-adhoc" },
    "CID-2002": { "DEV": "env-2002-dev", "OTHER": "env-2002-other" },
  },
}

const SLOTS = ["8:30 AM", "10:00 AM", "11:30 AM", "1:00 PM"]
const DOW = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const CSM_EMAILS = [
  "alex.morgan@strategy.com",
  "priya.nair@strategy.com",
  "dev.okafor@strategy.com",
  "sam.lindqvist@strategy.com",
  "rwhalen@strategy.com",
]

// --- Scheduling rules (PROTOTYPE — confirm exact values with CSM) ---
// Booking window: at least 1 week ahead, up to 90 days (from OCU docs).
const MIN_LEAD_DAYS = 7
const MAX_LEAD_DAYS = 90

// Quarterly major releases: Mar, Jun, Sep, Dec, ~3rd week. Months are 0-indexed.
// Using the Monday of the 3rd week as a placeholder boundary date per year.
const RELEASE_MONTHS = [2, 5, 8, 11] // March, June, September, December
function releaseDateFor(year, month) {
  // ~3rd week: day 15 is a reasonable placeholder until the real calendar is confirmed.
  return new Date(year, month, 15)
}
// Build the list of release boundary dates spanning the years we might show.
function getReleaseDates() {
  const years = [2025, 2026, 2027]
  const dates = []
  years.forEach((y) => RELEASE_MONTHS.forEach((m) => dates.push(releaseDateFor(y, m))))
  return dates
}
const RELEASE_DATES = getReleaseDates()

// Is a given day within the same release-week we mark on the calendar?
function isReleaseWeek(d) {
  return RELEASE_DATES.some((r) => {
    const diff = Math.abs(d - r) / (1000 * 60 * 60 * 24)
    return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth() && diff < 4
  })
}

// The next release boundary on or after a given date.
function nextReleaseAfter(d) {
  return RELEASE_DATES.filter((r) => r >= d).sort((a, b) => a - b)[0] || null
}

// Bookable = weekday, within the 1-week–90-day window.
function isBookable(d) {
  const day = d.getDay()
  if (day === 0 || day === 6) return false // no weekends
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const min = new Date(today); min.setDate(min.getDate() + MIN_LEAD_DAYS)
  const max = new Date(today); max.setDate(max.getDate() + MAX_LEAD_DAYS)
  return d >= min && d <= max
}

function App() {
  // cascade
  const [entitlement, setEntitlement] = useState("")
  const [cid, setCid] = useState("")
  const [environment, setEnvironment] = useState("")

  // calendar
  const [date, setDate] = useState(null)
  const [time, setTime] = useState("")
  const [viewDate, setViewDate] = useState(new Date(2026, 5, 1)) // June 2026

  // details
  const [bookerName, setBookerName] = useState("")
  const [csmEmail, setCsmEmail] = useState("")
  const [utilityBox, setUtilityBox] = useState("")
  const [comments, setComments] = useState("")
  const [privateNotes, setPrivateNotes] = useState("")

  // Environment ID is derived, not picked.
  const environmentId =
    entitlement && cid && environment ? DATA[entitlement][cid][environment] : ""

  const prevMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  const firstWeekday = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()

  // Warn if the chosen date falls after the next release boundary.
  const releaseWarning = (() => {
    if (!date) return ""
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const upcoming = nextReleaseAfter(today)
    if (upcoming && date > upcoming) {
      const label = `${MONTHS[upcoming.getMonth()]} ${upcoming.getFullYear()}`
      return `This date falls after the ${label} release. Environments booked before it will be on a different release — confirm all related OCUs land on the same side of the release boundary.`
    }
    return ""
  })()

  const FLOW_URL = import.meta.env.VITE_FLOW_URL

  const handleBook = async () => {
    const payload = {
      entitlement, cid, environment, environmentId,
      date: date ? date.toISOString().slice(0, 10) : "",
      time, bookerName, csmEmail, utilityBox, comments, privateNotes,
    }

    console.log("Booking payload:", payload)

    try {
      const res = await fetch(FLOW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        alert("Booking sent!")
      } else {
        alert("Flow responded with status " + res.status)
      }
    } catch (err) {
      alert("Couldn't reach the flow (likely CORS from localhost — check the console; the payload still logged).")
      console.error(err)
    }
  }

  return (
    <div className="page">
      <header className="brand-header">
        <img src={strategyLogo} className="logo-img" alt="Strategy" />
        <h1 className="brand-title">Strategy</h1>
      </header>

      <main className="content">
        <div className="service-card">
          <div className="service-name">OCU Booking Process</div>
        </div>

        <div className="field">
          <label>Entitlement</label>
          <select
            required
            value={entitlement}
            onChange={(e) => {
              setEntitlement(e.target.value)
              setCid("")
              setEnvironment("")
            }}
          >
            <option value="">-- select an option --</option>
            {Object.keys(DATA).map((ent) => (
              <option key={ent} value={ent}>{ent}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>CID</label>
          <select
            required
            value={cid}
            disabled={!entitlement}
            onChange={(e) => {
              setCid(e.target.value)
              setEnvironment("")
            }}
          >
            <option value="">-- select an option --</option>
            {entitlement &&
              Object.keys(DATA[entitlement]).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
          </select>
        </div>

        <div className="field">
          <label>Environment</label>
          <select
            required
            value={environment}
            disabled={!cid}
            onChange={(e) => setEnvironment(e.target.value)}
          >
            <option value="">-- select an option --</option>
            {entitlement && cid &&
              Object.keys(DATA[entitlement][cid]).map((env) => (
                <option key={env} value={env}>{env}</option>
              ))}
          </select>
        </div>

        <div className="field">
          <label>Environment ID (auto-filled)</label>
          <input
            type="text"
            value={environmentId}
            readOnly
            placeholder="Select CID and environment"
          />
        </div>

        <div className="field">
          <label>Select a date and time</label>
          <div className="cal-row">
            <div className="cal">
              <div className="cal-head">
                <button type="button" onClick={prevMonth}>‹</button>
                <span>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                <button type="button" onClick={nextMonth}>›</button>
              </div>

              <div className="cal-grid">
                {DOW.map((d, i) => (
                  <div key={i} className="cal-dow">{d}</div>
                ))}

                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={"blank" + i} />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1
                  const thisDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNum)
                  const bookable = isBookable(thisDay)
                  const selected = date && date.toDateString() === thisDay.toDateString()
                  const release = isReleaseWeek(thisDay)
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      disabled={!bookable}
                      title={release ? "Release week" : undefined}
                      className={
                        "cal-day" +
                        (selected ? " selected" : "") +
                        (release ? " release-week" : "")
                      }
                      onClick={() => {
                        setDate(thisDay)
                        setTime("")
                      }}
                    >
                      {dayNum}
                    </button>
                  )
                })}
              </div>

              <div className="cal-legend">
                <span className="legend-dot release" /> Release week (major release ~3rd week)
              </div>
            </div>

            <div className="cal-times">
              {date ? (
                SLOTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={"slot" + (time === t ? " selected" : "")}
                    onClick={() => setTime(t)}
                  >
                    {t}
                  </button>
                ))
              ) : (
                <div className="cal-hint">Select a date to see available times.</div>
              )}
            </div>
          </div>

          {releaseWarning && <div className="warning-box">{releaseWarning}</div>}

          <div className="tz">All times are in (UTC−05:00) Eastern Time (US &amp; Canada)</div>
        </div>

        <h3 className="section-head">Your details</h3>

        <div className="field">
          <label>Name of booker</label>
          <input
            type="text"
            value={bookerName}
            onChange={(e) => setBookerName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>CSM email address</label>
          <select value={csmEmail} onChange={(e) => setCsmEmail(e.target.value)}>
            <option value="">-- select an option --</option>
            {CSM_EMAILS.map((email) => (
              <option key={email} value={email}>{email}</option>
            ))}
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
          <button type="button" className="book-btn" onClick={handleBook}>Book</button>
        </div>
      </main>

      <footer className="site-footer">
        <p className="footer-policy"></p>
        <hr />
      </footer>
    </div>
  )
}

export default App