import { useState, useEffect, useMemo } from 'react'
import './Schedule.css'
import { REGIONS, REGION_BUILD_CAPACITY, REGION_SLOTS } from '../lib/bookings.js'
import { OPERATING_HOURS } from '../lib/operatingHours'

const NUM_DAYS = 14
const LANE_H = 58
const LANE_GAP = 6
const PAD = 8
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// --- date helpers ----------------------------------------------------------
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d) }
function fmtISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function strip(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function dayDiff(a, b) { return Math.round((strip(a) - strip(b)) / 86400000) }
function isWeekend(d) { const x = d.getDay(); return x === 0 || x === 6 }
function sameDay(a, b) { return strip(a).getTime() === strip(b).getTime() }
function sundayOf(d) { return addDays(strip(d), -d.getDay()) }
function countWeekdays(startISO, endISO) {
  let d = parseISO(startISO)
  const end = parseISO(endISO)
  let n = 0
  while (d <= end) { if (!isWeekend(d)) n++; d = addDays(d, 1) }
  return n
}
function fmtRange(start) {
  const end = addDays(start, NUM_DAYS - 1)
  const opt = { month: "short", day: "numeric" }
  return `${start.toLocaleDateString("en-US", opt)} – ${end.toLocaleDateString("en-US", opt)}`
}
function computeEndTime(startLabel, hours) {
  const m = startLabel?.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return ""
  let h = parseInt(m[1], 10) % 12
  if (/PM/i.test(m[3])) h += 12
  const t = h * 60 + parseInt(m[2], 10) + hours * 60
  const totalH = Math.floor(t / 60)
  const eh = totalH % 24, em = t % 60       // wrap past midnight
  const nextDay = totalH >= 24
  return `${((eh + 11) % 12) + 1}:${String(em).padStart(2, "0")} ${eh >= 12 ? "PM" : "AM"}${nextDay ? " (+1d)" : ""}`
}

// nth business day (inclusive) forward from a start ISO date.
function nthBusinessDay(startISO, n) {
  let d = parseISO(startISO)
  let count = 0
  while (count < n) {
    if (!isWeekend(d)) count++
    if (count < n) d = addDays(d, 1)
  }
  return fmtISO(d)
}

// Backend stores only scheduled_date; end/duration/label are derived here from
// operation type, mirroring the booking form's rules. Refresh duration assumes
// 8h since tier isn't persisted on the booking record.
const OP_META = {
  build:   { label: 'Environment Build', spanBusinessDays: 5, hours: 40 },
  refresh: { label: 'MD Refresh',        spanBusinessDays: 1, hours: 8 },
  cutover: { label: 'Cutover',           spanBusinessDays: 1, hours: 2 },
}

// Backend booking (snake_case) -> the shape this timeline renders.
function toUI(b) {
  const meta = OP_META[b.operation_type] || { label: b.operation_type, spanBusinessDays: 1, hours: 0 }
  const start = b.scheduled_date
  const end = b.operation_type === 'build' ? nthBusinessDay(start, meta.spanBusinessDays) : start
  return {
    id: b.id,
    operationType: b.operation_type,
    operationLabel: meta.label,
    title: b.company_name || meta.label,
    cid: b.company_id || '',
    environment: b.environment_name || '',
    region: b.region,
    start,
    end,
    startTime: b.scheduled_time || '',
    endTime: '',
    durationHours: meta.hours,
    status: b.status,
    privateNotes: b.notes || '',
    bookerName: b.requester_name || '',
  }
}

// Greedy lane assignment so overlapping bookings in a region stack instead of collide.
function assignLanes(items) {
  const laneEnds = []
  return items.map((it) => {
    const s = parseISO(it.start), e = parseISO(it.end)
    let lane = laneEnds.findIndex((end) => s > end)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e) } else { laneEnds[lane] = e }
    return { ...it, lane }
  })
}

// Most builds running on the same day within the visible window
function peakConcurrentBuilds(builds, days) {
  let peak = 0
  for (const d of days) {
    let c = 0
    for (const b of builds) if (parseISO(b.start) <= d && d <= parseISO(b.end)) c++
    if (c > peak) peak = c
  }
  return peak
}

export default function Schedule() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewStart, setViewStart] = useState(() => sundayOf(new Date()))
  const [selectedId, setSelectedId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const selected = bookings.find((b) => b.id === selectedId) || null

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      if (!res.ok) throw new Error(`Failed to load bookings (${res.status})`)
      const data = await res.json()
      setBookings(data.map(toUI))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelectedId(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const days = useMemo(
    () => Array.from({ length: NUM_DAYS }, (_, i) => addDays(viewStart, i)),
    [viewStart]
  )
  const today = strip(new Date())

  // Filter by company name / title
  const filteredBookings = useMemo(
    () => {
      const term = searchTerm.trim().toLowerCase()
      if (!term) return bookings
      return bookings.filter((b) =>
        (b.title || '').toLowerCase().includes(term)
      )
    },
    [bookings, searchTerm]
  )

  // rows = known regions + an "Unassigned" row if any booking has region == null
  const rows = useMemo(() => {
    const hasNull = filteredBookings.some((b) => b.region == null)
    return [...REGIONS, ...(hasNull ? ["__none"] : [])]
  }, [filteredBookings])

  // Persist an edit to the backend, then re-fetch so the timeline reflects
  // exactly what was saved. `patch` uses backend (snake_case) field names.
  const patchBooking = async (id, patch) => {
    setError('')
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        let detail = `Save failed (${res.status})`
        try { detail = (await res.json()).detail || detail } catch {}
        throw new Error(detail)
      }
      await refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  // Hard-delete a booking, then drop it from local state so the bar and its
  // capacity contribution disappear immediately.
  const deleteBooking = async (id) => {
    setError('')
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        let detail = `Delete failed (${res.status})`
        try { detail = (await res.json()).detail || detail } catch {}
        throw new Error(detail)
      }
      setBookings((prev) => prev.filter((b) => b.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="sched">
      <div className="sched-toolbar">
        <h2>Parallel build schedule</h2>

        {/* Search bar */}
        <input
          className="sched-search"
          type="text"
          placeholder="Search by company name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="spacer" />
        <span className="sched-range">{fmtRange(viewStart)}</span>
        <button className="sched-nav" aria-label="Previous two weeks" onClick={() => setViewStart(addDays(viewStart, -7))}>‹</button>
        <button className="sched-btn" onClick={() => setViewStart(sundayOf(new Date()))}>Today</button>
        <button className="sched-nav" aria-label="Next two weeks" onClick={() => setViewStart(addDays(viewStart, 7))}>›</button>
      </div>

      <div className="sched-legend">
        <span><i className="lg-build" />Build</span>
        <span><i className="lg-refresh" />MD Refresh</span>
        <span><i className="lg-cutover" />Cutover</span>
        <span style={{ marginLeft: "auto" }}>Dashed = pending</span>
      </div>

      {error && <div className="sched-empty" style={{ color: '#c2410c' }}>{error}</div>}

      <div className="sched-scroll">
        <div className="sched-board">
          {/* header */}
          <div className="sched-corner" />
          {days.map((d, i) => (
            <div key={i} className={"sched-dayhead" + (isWeekend(d) ? " weekend" : "") + (sameDay(d, today) ? " today" : "")}>
              <span className="dow">{DOW[d.getDay()]}</span>
              <span className="dom">{d.getDate()}</span>
            </div>
          ))}

          {/* region rows */}
          {rows.map((regionKey) => {
            const region = regionKey === "__none" ? null : regionKey
            const items = filteredBookings.filter((b) => b.region === region)
            const laid = assignLanes([...items].sort((a, b) => parseISO(a.start) - parseISO(b.start)))
            const laneCount = Math.max(1, ...laid.map((it) => it.lane + 1))
            const trackH = laneCount * (LANE_H + LANE_GAP) - LANE_GAP + PAD * 2
            const weekHours = items
              .filter((b) => b.status !== "cancelled")
              .reduce((sum, b) => sum + (b.durationHours || 0), 0)

            const limit = region != null ? REGION_BUILD_CAPACITY[region] : undefined
            const peakBuilds = limit != null
              ? peakConcurrentBuilds(items.filter((b) => b.operationType === "build" && b.status !== "cancelled"), days)
              : 0
            const capState = limit == null ? "" : peakBuilds > limit ? "over" : peakBuilds === limit ? "full" : ""

            return (
              <div className="sched-row-wrap" key={regionKey} style={{ display: "contents" }}>
                <div className="sched-rowlabel">
                  <div>
                    <div className="rl-name">{region || "Unassigned"}</div>
                    <div className="rl-sub">{region ? "Cloud Operations" : "Region TBD"}</div>
                  </div>
                  <div className="rl-cap">
                    {limit != null && (
                      <div className={"rl-builds " + capState} title="Peak concurrent builds in view / capacity">
                        {peakBuilds}/{limit} builds
                      </div>
                    )}
                    <div className="rl-hours">{weekHours}h</div>
                  </div>
                </div>

                <div className="sched-track" style={{ minHeight: trackH }}>
                  <div className="sched-track-bg">
                    {days.map((d, i) => (
                      <div key={i} className={"sched-bgcell" + (isWeekend(d) ? " weekend" : "") + (sameDay(d, today) ? " today" : "")} />
                    ))}
                  </div>

                  {laid.map((b) => {
                    const startIdx = dayDiff(parseISO(b.start), viewStart)
                    const endIdx = dayDiff(parseISO(b.end), viewStart)
                    if (endIdx < 0 || startIdx > NUM_DAYS - 1) return null // off-window
                    const cs = Math.max(startIdx, 0)
                    const ce = Math.min(endIdx, NUM_DAYS - 1)
                    const left = (cs / NUM_DAYS) * 100
                    const width = ((ce - cs + 1) / NUM_DAYS) * 100
                    const top = PAD + b.lane * (LANE_H + LANE_GAP)
                    return (
                      <button
                        key={b.id}
                        className={`sched-bar bar-${b.operationType} status-${b.status}`}
                        style={{ left: `${left}%`, width: `calc(${width}% - 4px)`, top, height: LANE_H }}
                        onClick={() => setSelectedId(b.id)}
                      >
                        <span className="b-title">{b.title || b.operationLabel}</span>
                        <span className="b-sub">{[b.cid, b.environment].filter(Boolean).join(" · ")}</span>
                        <span className="b-foot">
                          {b.startTime ? `${b.startTime} · ` : ""}{b.durationHours}h
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!loading && filteredBookings.length === 0 && (
        <div className="sched-empty">
          {searchTerm ? 'No bookings match this company name.' : 'No bookings yet.'}
        </div>
      )}

      {selected && (
        <DetailModal
          key={selected.id}
          b={selected}
          onSave={(patch) => patchBooking(selected.id, patch)}
          onDelete={() => deleteBooking(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function DetailModal({ b, onSave, onDelete, onClose }) {
  const isBuild = b.operationType === "build"
  const pickTime = b.operationType !== "build"

  const [title, setTitle] = useState(b.title || b.operationLabel || "")
  const [start, setStart] = useState(b.start)
  const [end, setEnd] = useState(b.end)
  const [startTime, setStartTime] = useState(b.startTime || "")
  const [notes, setNotes] = useState(b.privateNotes || "")
  const [region, setRegion] = useState(b.region)

  const endTime = pickTime && startTime ? computeEndTime(startTime, b.durationHours) : b.endTime
  const workingDays = isBuild ? Math.max(1, countWeekdays(start, end)) : 1
  const hoursPerDay = Math.round((b.durationHours / workingDays) * 10) / 10

  // Region selects which slot list applies; times are US Eastern.
  const slots = region ? (REGION_SLOTS[region] || []) : []

  // Moving the start date shifts the whole window, preserving its length.
  const onStartChange = (iso) => {
    if (!iso) return
    if (isBuild) {
      const delta = dayDiff(parseISO(iso), parseISO(start))
      setEnd(fmtISO(addDays(parseISO(end), delta)))
      setStart(iso)
    } else {
      setStart(iso); setEnd(iso)
    }
  }

  const save = () => {
    // Map the modal's UI fields back to backend column names. Build end is
    // derived from the start on render, so only scheduled_date is sent.
    onSave({
      company_name: title,
      scheduled_date: start,
      region: region || null,
      notes: notes || null,
      ...(pickTime ? { scheduled_time: startTime } : {}),
    })
    onClose()
  }

  return (
    <div className="sched-overlay" onClick={onClose}>
      <div className="sched-modal alloc" onClick={(e) => e.stopPropagation()}>
        <div className="sched-modal-head">
          <div>
            <h3>{b.operationLabel}</h3>
            <span className={`pill ${b.status}`}>{b.status}</span>
          </div>
          <button className="sched-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="sched-modal-body">
          <div className="alloc-summary">
            <div className="alloc-stats">
              <div className="stat">
                <span className="stat-label">Hours</span>
                <span className="stat-big">{hoursPerDay}<small>h/day</small></span>
              </div>
              <div className="stat">
                <span className="stat-label">Total hours</span>
                <span className="stat-big">{b.durationHours}</span>
              </div>
              <div className="stat grow">
                <span className="stat-label">
                  Duration: {workingDays} working day{workingDays === 1 ? "" : "s"}
                </span>
                <div className="date-range">
                  <input type="date" value={start} onChange={(e) => onStartChange(e.target.value)} />
                  {isBuild && (
                    <>
                      <span className="chev">›</span>
                      <input type="date" value={end} readOnly />
                    </>
                  )}
                </div>
              </div>
            </div>

            {pickTime && (
              <div className="alloc-time">
                <span className="stat-label">
                  Start time <small className="muted">(US Eastern)</small>
                </span>
                <select value={slots.includes(startTime) ? startTime : ""} onChange={(e) => setStartTime(e.target.value)}>
                  {!slots.includes(startTime) && <option value="">{startTime || "—"}</option>}
                  {slots.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="muted">– {endTime}</span>
              </div>
            )}
          </div>

          <div className="alloc-field">
            <label>Project</label>
            <div className="alloc-box ro">{[b.cid, b.environment].filter(Boolean).join(" / ") || "—"}</div>
          </div>

          <div className="alloc-field">
            <label>Task</label>
            <input className="alloc-box" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="alloc-field">
            <label>Notes</label>
            <textarea
              className="alloc-box"
              placeholder="Add details specific to this booking"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="alloc-field">
            <label>Region</label>
            <select className="alloc-box" value={region || ""} onChange={(e) => setRegion(e.target.value || null)}>
              <option value="">Unassigned</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {b.bookerName && <div className="alloc-meta">Booked by {b.bookerName}</div>}
        </div>

        <div className="alloc-buttons">
          <button className="btn-update" onClick={save}>Update</button>
          <button className="btn-light" onClick={onClose}>Close</button>
          <span className="spacer" />
          <button className="btn-link danger" onClick={() => { onDelete(); onClose() }}>Delete booking</button>
        </div>
      </div>
    </div>
  )
}