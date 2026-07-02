import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'

const DOW = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function startOfToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
function fmtISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function fmtShort(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

// OCU booking form. Manual entry for now; the CID / environment inputs are the
// seam where ServiceNow autofill slots in later (same pattern as migration).
export default function OCUForm() {
  const { user } = useAuth()

  const [cid, setCid] = useState('')
  const [environmentType, setEnvironmentType] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [csmEmail, setCsmEmail] = useState(user?.email || '')
  const [detailsText, setDetailsText] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState('')

  // calendar
  const [date, setDate] = useState(null)  // selected day (Date object)
  const [viewDate, setViewDate] = useState(() => {
    const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [takenDates, setTakenDates] = useState(new Set())  // ISO strings with an OCU booking

  // Load existing OCU bookings so their dates can be blocked.
  async function loadTaken() {
    try {
      const res = await fetch('/api/bookings')
      if (!res.ok) return
      const data = await res.json()
      const taken = data
        .filter((b) => b.process_type === 'ocu' && b.status !== 'cancelled' && b.scheduled_date)
        .map((b) => b.scheduled_date)
      setTakenDates(new Set(taken))
    } catch { /* leave takenDates as-is */ }
  }
  useEffect(() => { loadTaken() }, [])

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  const firstWeekday = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()

  // A day is selectable if it's today or later and has no OCU booking.
  function isSelectable(day) {
    if (day < startOfToday()) return false
    if (takenDates.has(fmtISO(day))) return false
    return true
  }

  const canBook = cid && environmentId && date && time

  async function handleBook() {
    setError('')
    const isoDate = fmtISO(date)
    const body = {
      process_type: 'ocu',
      scheduled_date: isoDate,
      scheduled_time: time,
      company_id: cid || null,
      environment_id: environmentId || null,
      environment_name: environmentType || null,
      requester_email: csmEmail || null,
      requester_name: user?.displayName || null,
      notes: detailsText || null,
      details: {
        cid: cid || null,
        environment_type: environmentType || null,
        environment_id: environmentId || null,
        csm_email: csmEmail || null,
        details_text: detailsText || null,
        field_source: {
          cid: 'manual',
          environment_type: 'manual',
          environment_id: 'manual',
        },
      },
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let detail = `Server responded with status ${res.status}`
        try { detail = (await res.json()).detail || detail } catch {}
        throw new Error(detail)
      }
      alert('OCU booking saved!')
      setTakenDates((prev) => new Set(prev).add(isoDate))  // block the day immediately
      setCid(''); setEnvironmentType(''); setEnvironmentId('')
      setDetailsText(''); setDate(null); setTime('')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <div className="field">
        <label>CID</label>
        <input type="text" value={cid} onChange={(e) => setCid(e.target.value)}
          placeholder="Customer ID" />
      </div>

      <div className="field">
        <label>Environment type</label>
        <select value={environmentType} onChange={(e) => setEnvironmentType(e.target.value)}>
          <option value="">-- select --</option>
          <option value="DEV">DEV</option>
          <option value="PROD">PROD</option>
        </select>
      </div>

      <div className="field">
        <label>Environment ID</label>
        <input type="text" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}
          placeholder="Environment identifier" />
      </div>

      <div className="field">
        <label>CSM email</label>
        <input type="text" value={csmEmail} onChange={(e) => setCsmEmail(e.target.value)}
          placeholder="csm@strategy.com" />
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
              {DOW.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={"blank" + i} />)}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1
                const thisDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNum)
                const iso = fmtISO(thisDay)
                const taken = takenDates.has(iso)
                const selectable = isSelectable(thisDay)
                const selected = date && date.toDateString() === thisDay.toDateString()
                return (
                  <button
                    key={dayNum}
                    type="button"
                    disabled={!selectable}
                    title={taken ? "Already booked" : undefined}
                    className={"cal-day" + (selected ? " selected" : "")}
                    onClick={() => setDate(thisDay)}
                  >
                    {dayNum}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cal-times">
            {!date ? (
              <div className="cal-hint">Select a date to set a time.</div>
            ) : (
              <>
                <div className="cal-hint" style={{ marginBottom: 8 }}>
                  <strong>{fmtShort(date)}</strong>
                </div>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </>
            )}
          </div>
        </div>

        <div className="tz">All times are in (UTC−05:00) Eastern Time (US &amp; Canada)</div>
      </div>

      <div className="field">
        <label>Details (optional)</label>
        <textarea value={detailsText} onChange={(e) => setDetailsText(e.target.value)}
          placeholder="Any additional details for this OCU request" />
      </div>

      {error && <p style={{ color: '#c2410c', fontSize: '0.85rem' }}>{error}</p>}

      <div className="book-row">
        <button type="button" className="book-btn" onClick={handleBook} disabled={!canBook}>Book</button>
      </div>
    </>
  )
}