import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'

const DOW = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// 30-minute slots across the full day, labelled like "3:00 AM". Narrow this
// range later if OCU should have restricted booking hours.
const OCU_SLOTS = (() => {
  const out = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const ampm = h >= 12 ? "PM" : "AM"
      const dispH = ((h + 11) % 12) + 1
      out.push(`${dispH}:${String(m).padStart(2, "0")} ${ampm}`)
    }
  }
  return out
})()

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
  const [date, setDate] = useState(null)
  const [viewDate, setViewDate] = useState(() => {
    const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  // existing OCU bookings as {date, time} pairs, for per-slot blocking
  const [ocuBookings, setOcuBookings] = useState([])

  async function loadBookings() {
    try {
      const res = await fetch('/api/bookings')
      if (!res.ok) return
      const data = await res.json()
      setOcuBookings(
        data
          .filter((b) => b.process_type === 'ocu' && b.status !== 'cancelled' && b.scheduled_date)
          .map((b) => ({ date: b.scheduled_date, time: b.scheduled_time }))
      )
    } catch { /* leave as-is */ }
  }
  useEffect(() => { loadBookings() }, [])

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  const firstWeekday = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()

  // Slots already taken on the selected date.
  const takenSet = date
    ? new Set(ocuBookings.filter((b) => b.date === fmtISO(date)).map((b) => b.time))
    : new Set()
  const freeCount = OCU_SLOTS.length - takenSet.size

  // A day is selectable if today-or-later and not every slot is taken.
  function isSelectable(day) {
    if (day < startOfToday()) return false
    const iso = fmtISO(day)
    const takenOnDay = ocuBookings.filter((b) => b.date === iso).length
    return takenOnDay < OCU_SLOTS.length
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
      setOcuBookings((prev) => [...prev, { date: isoDate, time }])  // block that slot immediately
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
                const selectable = isSelectable(thisDay)
                const selected = date && date.toDateString() === thisDay.toDateString()
                return (
                  <button
                    key={dayNum}
                    type="button"
                    disabled={!selectable}
                    className={"cal-day" + (selected ? " selected" : "")}
                    onClick={() => { setDate(thisDay); setTime("") }}
                  >
                    {dayNum}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cal-times">
            {!date ? (
              <div className="cal-hint">Select a date to see start times.</div>
            ) : (
              <>
                <div className="cal-hint" style={{ marginBottom: 8 }}>
                  <strong>{freeCount}</strong> of {OCU_SLOTS.length} slots free on {fmtShort(date)}
                </div>
                {OCU_SLOTS.map((t) => {
                  const taken = takenSet.has(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={taken}
                      title={taken ? "Already booked for this day" : undefined}
                      className={"slot" + (time === t ? " selected" : "") + (taken ? " taken" : "")}
                      onClick={() => setTime(t)}
                    >
                      {t}{taken ? " · booked" : ""}
                    </button>
                  )
                })}
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