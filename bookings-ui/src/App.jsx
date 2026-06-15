import { useState } from 'react'
import './App.css'

// Environments now map to their Environment ID, so the ID can be derived
// from entitlement + CID + environment (last in the cascade waterfall).
// Each CID exposes only its own valid subset of environments.
// Full possible environment type set: PROD, DEV, UAT, QA, SBX, ADHOC, SIT, PERF, TEST, OTHER, DR
const DATA = {
  "Entitlement A": {
    "CID-1001": {
      "PROD": "env-1001-prod",
      "DEV": "env-1001-dev",
      "UAT": "env-1001-uat",
      "DR": "env-1001-dr",
    },
    "CID-1002": {
      "DEV": "env-1002-dev",
      "QA": "env-1002-qa",
      "SBX": "env-1002-sbx",
      "TEST": "env-1002-test",
    },
  },
  "Entitlement B": {
    "CID-2001": {
      "PROD": "env-2001-prod",
      "UAT": "env-2001-uat",
      "SIT": "env-2001-sit",
      "PERF": "env-2001-perf",
      "ADHOC": "env-2001-adhoc",
    },
    "CID-2002": {
      "DEV": "env-2002-dev",
      "OTHER": "env-2002-other",
    },
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
]

// Bookable = weekday and not in the past. This is where real availability
// rules will eventually plug in (patch windows, dev-before-prod, etc.).
function isBookable(d) {
  const day = d.getDay()
  if (day === 0 || day === 6) return false // no weekends
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d >= today
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

  // Environment ID is derived and not picked. Info auto-fills from CID + environment.
  const environmentId =
    entitlement && cid && environment ? DATA[entitlement][cid][environment] : ""

  const prevMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  const firstWeekday = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()

  return (
    <div className="page">
      <header className="brand-header">
        <div className="logo-tile">Strategy</div>
        <h1 className="brand-title">Parallel Build Demo</h1>
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
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      disabled={!bookable}
                      className={"cal-day" + (selected ? " selected" : "")}
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
          <button type="button" className="book-btn">Book</button>
        </div>
      </main>

      <footer className="site-footer">
        <p className="footer-policy">
              Strategy
        </p>
        <hr />
      </footer>
    </div>
  )
}

export default App