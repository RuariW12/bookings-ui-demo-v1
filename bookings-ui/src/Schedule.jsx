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

  const moveTo = (id, newStartISO) => {
    setBookings((bs) => bs.map((b) => {
      if (b.id !== id) return b
      const delta = dayDiff(parseISO(newStartISO), parseISO(b.start))
      return { ...b, start: newStartISO, end: fmtISO(addDays(parseISO(b.end), delta)) }
    }))
  }

  const setTime = (id, startTime, durationHours) =>
    updateBooking(id, { startTime, endTime: computeEndTime(startTime, durationHours) })

  return (
    <div className="sched">
      <div className="sched-toolbar">
        <h2>Parallel build Calendar</h2>
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
        <span style={{ marginLeft: "auto" }}>Dashed = pending · faded = cancelled</span>
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
          b={selected}
          onClose={() => setSelectedId(null)}
          onMove={(iso) => moveTo(selected.id, iso)}
          onTime={(t) => setTime(selected.id, t, selected.durationHours)}
          onCancel={() => updateBooking(selected.id, { status: "cancelled" })}
          onRestore={() => updateBooking(selected.id, { status: "pending" })}
        />
      )}
    </div>
  )
}

function DetailModal({ b, onClose, onMove, onTime, onCancel, onRestore }) {
  const isBuild = b.operationType === "build"
  return (
    <div className="sched-overlay" onClick={onClose}>
      <div className="sched-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sched-modal-head">
          <div>
            <h3>{b.title || b.operationLabel}</h3>
            <span className={`pill ${b.status}`}>{b.status}</span>
          </div>
          <button className="sched-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="sched-modal-body">
          <dl>
            <dt>Operation</dt><dd>{b.operationLabel}{b.tier ? ` (${b.tier === "lower" ? "lower-tier" : "PROD/large"})` : ""}</dd>
            <dt>Region</dt><dd>{b.region || "Unassigned"}</dd>
            <dt>CID</dt><dd>{b.cid || "—"}</dd>
            <dt>Environment</dt><dd>{b.environment || "—"}</dd>
            {isBuild ? (
              <>
                <dt>Build window</dt><dd>{b.start} → {b.end}</dd>
              </>
            ) : (
              <>
                <dt>Date</dt><dd>{b.start}</dd>
                <dt>Time</dt><dd>{b.startTime} – {b.endTime}</dd>
              </>
            )}
            <dt>Duration</dt><dd>{b.durationHours}h</dd>
            <dt>Booked by</dt><dd>{b.bookerName || b.csmEmail || "—"}</dd>
          </dl>

          <div className="sched-edit">
            <label>{isBuild ? "Move build start date" : "Move date"}</label>
            <input type="date" value={b.start} onChange={(e) => e.target.value && onMove(e.target.value)} />

            {!isBuild && (
              <>
                <label>Start time</label>
                <select value={SLOTS.includes(b.startTime) ? b.startTime : ""} onChange={(e) => onTime(e.target.value)}>
                  {!SLOTS.includes(b.startTime) && <option value="">{b.startTime}</option>}
                  {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="sched-actions">
          {b.status === "cancelled"
            ? <button className="btn-restore" onClick={onRestore}>Restore</button>
            : <button className="btn-cancel" onClick={onCancel}>Cancel booking</button>}
          <button className="btn-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
