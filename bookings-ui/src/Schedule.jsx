import { useState, useEffect, useMemo } from 'react'
import './Schedule.css'
import { REGIONS, SEED_BOOKINGS } from './bookings'

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
  const eh = Math.floor(t / 60), em = t % 60
  return `${((eh + 11) % 12) + 1}:${String(em).padStart(2, "0")} ${eh >= 12 ? "PM" : "AM"}`
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

const SLOTS = ["8:30 AM", "10:00 AM", "11:30 AM", "1:00 PM"]

export default function Schedule() {
  const [bookings, setBookings] = useState(SEED_BOOKINGS)
  const [viewStart, setViewStart] = useState(() => sundayOf(new Date()))
  const [selectedId, setSelectedId] = useState(null)

  const selected = bookings.find((b) => b.id === selectedId) || null

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

  // rows = known regions + an "Unassigned" row if any booking has region == null
  const rows = useMemo(() => {
    const hasNull = bookings.some((b) => b.region == null)
    return [...REGIONS, ...(hasNull ? ["__none"] : [])]
  }, [bookings])

  const updateBooking = (id, patch) =>
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  return (
    <div className="sched">
      <div className="sched-toolbar">
        <h2>Parallel Build Calendar</h2>
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
        <span style={{ marginLeft: "auto" }}>Solid = Booked · Dashed = pending · faded = cancelled</span>
      </div>

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
            const items = bookings.filter((b) => b.region === region)
            const laid = assignLanes([...items].sort((a, b) => parseISO(a.start) - parseISO(b.start)))
            const laneCount = Math.max(1, ...laid.map((it) => it.lane + 1))
            const trackH = laneCount * (LANE_H + LANE_GAP) - LANE_GAP + PAD * 2
            const weekHours = items
              .filter((b) => b.status !== "cancelled")
              .reduce((sum, b) => sum + (b.durationHours || 0), 0)

            return (
              <div className="sched-row-wrap" key={regionKey} style={{ display: "contents" }}>
                <div className="sched-rowlabel">
                  <div>
                    <div className="rl-name">{region || "Unassigned"}</div>
                    <div className="rl-sub">{region ? "Cloud Operations" : "Region TBD"}</div>
                  </div>
                  <div className="rl-hours">{weekHours}h</div>
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

      {bookings.length === 0 && <div className="sched-empty">No bookings yet.</div>}

      {selected && (
        <DetailModal
          key={selected.id}
          b={selected}
          onSave={(patch) => updateBooking(selected.id, patch)}
          onCancelBooking={() => updateBooking(selected.id, { status: "cancelled" })}
          onRestore={() => updateBooking(selected.id, { status: "pending" })}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function DetailModal({ b, onSave, onCancelBooking, onRestore, onClose }) {
  const isBuild = b.operationType === "build"
  const pickTime = b.operationType !== "build"

  const [title, setTitle] = useState(b.title || b.operationLabel || "")
  const [start, setStart] = useState(b.start)
  const [end, setEnd] = useState(b.end)
  const [startTime, setStartTime] = useState(b.startTime || "")
  const [status, setStatus] = useState(b.status)
  const [notes, setNotes] = useState(b.privateNotes || "")
  const [region, setRegion] = useState(b.region)

  const endTime = pickTime && startTime ? computeEndTime(startTime, b.durationHours) : b.endTime
  const workingDays = isBuild ? Math.max(1, countWeekdays(start, end)) : 1
  const hoursPerDay = Math.round((b.durationHours / workingDays) * 10) / 10

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
    onSave({
      title, start, end, status, privateNotes: notes, region,
      ...(pickTime ? { startTime, endTime } : {}),
    })
    onClose()
  }

  return (
    <div className="sched-overlay" onClick={onClose}>
      <div className="sched-modal alloc" onClick={(e) => e.stopPropagation()}>
        <div className="sched-modal-head">
          <div>
            <h3>{b.operationLabel}</h3>
            <span className={`pill ${status}`}>{status}</span>
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
                <span className="stat-label">Start time</span>
                <select value={SLOTS.includes(startTime) ? startTime : ""} onChange={(e) => setStartTime(e.target.value)}>
                  {!SLOTS.includes(startTime) && <option value="">{startTime || "—"}</option>}
                  {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
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
            <label>Status</label>
            <div className="alloc-pills">
              <button type="button" className={status === "pending" ? "on" : ""} onClick={() => setStatus("pending")}>Pending</button>
              <button type="button" className={status === "approved" ? "on" : ""} onClick={() => setStatus("approved")}>Approved</button>
            </div>
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
            <label>Assigned to</label>
            <div className="alloc-box chips">
              {region
                ? <span className="chip">{region} <button type="button" aria-label="Unassign" onClick={() => setRegion(null)}>×</button></span>
                : <span className="muted">Unassigned</span>}
            </div>
          </div>

          {b.bookerName && <div className="alloc-meta">Booked by {b.bookerName}</div>}
        </div>

        <div className="alloc-buttons">
          <button className="btn-update" onClick={save}>Update</button>
          <button className="btn-light" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          {status === "cancelled"
            ? <button className="btn-link ok" onClick={() => { onRestore(); onClose() }}>Restore booking</button>
            : <button className="btn-link danger" onClick={() => { onCancelBooking(); onClose() }}>Cancel booking</button>}
        </div>
      </div>
    </div>
  )
}