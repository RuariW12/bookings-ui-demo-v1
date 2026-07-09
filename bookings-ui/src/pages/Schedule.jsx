import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import './Schedule.css'
import { REGIONS, REGION_BUILD_CAPACITY, REGION_SLOTS } from '../lib/bookings.js'
import { useAuth } from '../lib/auth'
import { listBlocks, addBlock, removeBlock } from '../lib/blocks'

const NUM_DAYS = 14
const LANE_H = 58
const LANE_GAP = 6
const PAD = 8
const COLLAPSED_H = 26
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Status visual language. Inline so it overrides any Schedule.css rule.
const STATUS_BORDER = {
  pending:   '3px dashed #e0a458',
  approved:  '2px solid #16a34a',
  rejected:  '2px solid #dc2626',
  cancelled: '2px dashed #b6b3ae',
}

// --- date helpers ----------------------------------------------------------
function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function strip(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function dayDiff(a, b) {
  return Math.round((strip(a) - strip(b)) / 86400000)
}
function isWeekend(d) {
  const x = d.getDay()
  return x === 0 || x === 6
}
function sameDay(a, b) {
  return strip(a).getTime() === strip(b).getTime()
}
function sundayOf(d) {
  return addDays(strip(d), -d.getDay())
}
function countWeekdays(startISO, endISO) {
  let d = parseISO(startISO)
  const end = parseISO(endISO)
  let n = 0
  while (d <= end) {
    if (!isWeekend(d)) n++
    d = addDays(d, 1)
  }
  return n
}
function fmtRange(start) {
  const end = addDays(start, NUM_DAYS - 1)
  const opt = { month: "short", day: "numeric" }
  return `${start.toLocaleDateString("en-US", opt)} – ${end.toLocaleDateString("en-US", opt)}`
}
function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function computeEndTime(startLabel, hours) {
  const m = startLabel?.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return ""
  let h = parseInt(m[1], 10) % 12
  if (/PM/i.test(m[3])) h += 12
  const t = h * 60 + parseInt(m[2], 10) + hours * 60
  const totalH = Math.floor(t / 60)
  const eh = totalH % 24
  const em = t % 60
  const nextDay = totalH >= 24
  return `${((eh + 11) % 12) + 1}:${String(em).padStart(2, "0")} ${eh >= 12 ? "PM" : "AM"}${nextDay ? " (+1d)" : ""}`
}
function nthBusinessDay(startISO, n) {
  let d = parseISO(startISO)
  let count = 0
  while (count < n) {
    if (!isWeekend(d)) count++
    if (count < n) d = addDays(d, 1)
  }
  return fmtISO(d)
}

// --- op meta ---------------------------------------------------------------
const OP_META = {
  build:   { label: 'Environment Build', spanBusinessDays: 5, hours: 40 },
  refresh: { label: 'MD Refresh',        spanBusinessDays: 1, hours: 8  },
  cutover: { label: 'Cutover',           spanBusinessDays: 1, hours: 2  },
}

function toUI(b) {
  const meta = OP_META[b.operation_type] || {
    label: b.operation_type,
    spanBusinessDays: 1,
    hours: 0,
  }
  const start = b.scheduled_date
  const end =
    b.operation_type === 'build'
      ? nthBusinessDay(start, meta.spanBusinessDays)
      : start
  return {
    id: b.id,
    operationType: b.operation_type,
    operationLabel: meta.label,
    companyName: b.company_name || '',
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
    serviceNowCaseId: b.servicenow_case_id || '',
  }
}

// --- lane helpers ----------------------------------------------------------
function assignLanes(items) {
  const laneEnds = []
  return items.map((it) => {
    const s = parseISO(it.start)
    const e = parseISO(it.end)
    let lane = laneEnds.findIndex((end) => s > end)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(e)
    } else {
      laneEnds[lane] = e
    }
    return { ...it, lane }
  })
}

function peakConcurrentBuilds(builds, days) {
  let peak = 0
  for (const d of days) {
    let c = 0
    for (const b of builds) {
      if (parseISO(b.start) <= d && d <= parseISO(b.end)) c++
    }
    if (c > peak) peak = c
  }
  return peak
}

// ===========================================================================
// SearchBox – inlined component
// ===========================================================================
function SearchBox({ bookings, onSelect }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [cursor, setCursor] = useState(-1)
  const containerRef        = useRef(null)
  const inputRef            = useRef(null)

  // Match on CID, return every matching booking with no de-duplication or cap
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return bookings.filter((b) =>
      (b.cid || '').toLowerCase().includes(q)
    )
  }, [query, bookings])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setCursor(-1)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  // Reset cursor when suggestion list length changes
  useEffect(() => {
    setCursor(-1)
  }, [suggestions.length])

  const commit = useCallback(
    (booking) => {
      setQuery('')
      setOpen(false)
      setCursor(-1)
      onSelect(booking)
    },
    [onSelect],
  )

  function handleChange(e) {
    setQuery(e.target.value)
    setOpen(true)
    setCursor(-1)
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = cursor >= 0 ? suggestions[cursor] : suggestions[0]
      if (target) commit(target)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setCursor(-1)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="sb-wrap" ref={containerRef}>
      <input
        ref={inputRef}
        className="sched-search"
        type="text"
        placeholder="Search by CID…"
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={handleChange}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 && (
        <ul className="sb-dropdown" role="listbox">
          {suggestions.map((b, i) => (
            <li
              key={b.id}
              role="option"
              aria-selected={i === cursor}
              className={'sb-item' + (i === cursor ? ' sb-item--active' : '')}
              onPointerDown={(e) => {
                e.preventDefault()
                commit(b)
              }}
            >
              {/* CID is the primary label since that is what we searched on */}
              <span className="sb-item-title">{b.cid}</span>
              <span className="sb-item-meta">
                {[b.companyName, b.region ?? 'No region', fmtDate(b.start)].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ===========================================================================
// Schedule – main page component
// ===========================================================================
export default function Schedule() {
  const { user } = useAuth()
  const actorEmail = user?.email || ''
  const isAdmin = user?.role === 'admin'

  const [bookings, setBookings]     = useState([])
  const [blocks, setBlocks]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [viewStart, setViewStart]   = useState(() => sundayOf(new Date()))
  const [selectedId, setSelectedId] = useState(null)
  const [showBlocks, setShowBlocks] = useState(false)
  // Regions whose bookings are hidden. Purely a local view preference.
  const [collapsed, setCollapsed]   = useState(() => new Set())

  const selected = bookings.find((b) => b.id === selectedId) || null

  const toggleRegionCollapse = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // ── data fetching ──────────────────────────────────────────────────────
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

  async function refreshBlocks() {
    try { setBlocks(await listBlocks()) }
    catch (e) { setError(e.message) }
  }

  useEffect(() => { refresh(); refreshBlocks() }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelectedId(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── search → jump ──────────────────────────────────────────────────────
  function handleSearchSelect(booking) {
    const bookingDate = parseISO(booking.start)
    const newStart = sundayOf(addDays(bookingDate, -3))
    setViewStart(newStart)
    setSelectedId(booking.id)
    // Jumping to a booking in a hidden region should reveal it.
    const key = booking.region ?? '__none'
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // ── block mutations ──────────────────────────────────────────────────────
  async function createBlock(payload) {
    await addBlock(payload, actorEmail)   // throws on failure; modal shows it
    await refreshBlocks()
  }
  async function removeBlk(id) {
    await removeBlock(id, actorEmail)
    await refreshBlocks()
  }

  // Blocks affecting a given region + day.
  function cellBlocks(region, iso) {
    if (!region) return []
    return blocks.filter((bl) => bl.blockDate === iso && bl.regions.includes(region))
  }

  // ── derived data ────────────────────────────────────────────────────────
  const days = useMemo(
    () => Array.from({ length: NUM_DAYS }, (_, i) => addDays(viewStart, i)),
    [viewStart],
  )
  const today = strip(new Date())

  const rows = useMemo(() => {
    const hasNull = bookings.some((b) => b.region == null)
    return [...REGIONS, ...(hasNull ? ["__none"] : [])]
  }, [bookings])

  // ── mutations ───────────────────────────────────────────────────────────
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
      setSelectedId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="sched">
      <div className="sched-toolbar">
        <h2>Parallel build schedule</h2>

        <SearchBox bookings={bookings} onSelect={handleSearchSelect} />

        {isAdmin && (
          <button className="sched-btn" onClick={() => setShowBlocks(true)}>
            Block dates
          </button>
        )}

        <div className="spacer" />
        <span className="sched-range">{fmtRange(viewStart)}</span>
        <button
          className="sched-nav"
          aria-label="Previous two weeks"
          onClick={() => setViewStart(addDays(viewStart, -7))}
        >
          ‹
        </button>
        <button className="sched-btn" onClick={() => setViewStart(sundayOf(new Date()))}>
          Today
        </button>
        <button
          className="sched-nav"
          aria-label="Next two weeks"
          onClick={() => setViewStart(addDays(viewStart, 7))}
        >
          ›
        </button>
      </div>

      <div className="sched-legend">
        <span><i className="lg-build" />Build</span>
        <span><i className="lg-refresh" />MD Refresh</span>
        <span><i className="lg-cutover" />Cutover</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: "0.75rem" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 11, border: "1.5px dashed #e0a458", borderRadius: 2 }} />Pending
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 11, border: "1.5px solid #16a34a", borderRadius: 2 }} />Approved
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 11, borderRadius: 2, background: "repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 3px,#f3f4f6 3px,#f3f4f6 6px)" }} />Blocked
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#16a34a", flex: "0 0 auto" }} />
            SNOW case
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 14, height: 14, borderRadius: "50%", background: "#f59e0b",
              color: "#fff", fontSize: "0.6rem", fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1, flex: "0 0 auto",
            }}>!</span>
            No SNOW case
          </span>
        </span>
      </div>

      {error && (
        <div className="sched-empty" style={{ color: '#c2410c' }}>{error}</div>
      )}

      <div className="sched-scroll">
        <div className="sched-board">
          {/* ── column headers ── */}
          <div className="sched-corner" />
          {days.map((d, i) => (
            <div
              key={i}
              className={
                "sched-dayhead" +
                (isWeekend(d) ? " weekend" : "") +
                (sameDay(d, today) ? " today" : "")
              }
            >
              <span className="dow">{DOW[d.getDay()]}</span>
              <span className="dom">{d.getDate()}</span>
            </div>
          ))}

          {/* ── region rows ── */}
          {rows.map((regionKey) => {
            const region = regionKey === "__none" ? null : regionKey
            const isCollapsed = collapsed.has(regionKey)
            const items  = bookings.filter((b) => b.region === region)
            const laid   = assignLanes(
              [...items].sort((a, b) => parseISO(a.start) - parseISO(b.start)),
            )
            const laneCount = Math.max(1, ...laid.map((it) => it.lane + 1))
            const trackH    = isCollapsed
              ? COLLAPSED_H
              : laneCount * (LANE_H + LANE_GAP) - LANE_GAP + PAD * 2

            const weekHours = items
              .filter((b) => b.status !== "cancelled")
              .reduce((sum, b) => sum + (b.durationHours || 0), 0)

            const limit = region != null ? REGION_BUILD_CAPACITY[region] : undefined
            const peakBuilds =
              limit != null
                ? peakConcurrentBuilds(
                    items.filter(
                      (b) => b.operationType === "build" && b.status !== "cancelled",
                    ),
                    days,
                  )
                : 0
            const capState =
              limit == null
                ? ""
                : peakBuilds > limit
                  ? "over"
                  : peakBuilds === limit
                    ? "full"
                    : ""

            return (
              <div className="sched-row-wrap" key={regionKey} style={{ display: "contents" }}>
                <div className="sched-rowlabel">
                  <button
                    onClick={() => toggleRegionCollapse(regionKey)}
                    title={isCollapsed ? "Show bookings" : "Hide bookings"}
                    aria-label={isCollapsed ? `Show ${region || "unassigned"} bookings` : `Hide ${region || "unassigned"} bookings`}
                    aria-expanded={!isCollapsed}
                    style={{
                      flex: "0 0 auto", width: 20, height: 20, marginRight: 6,
                      border: "1px solid #d7d5d2", background: "#fff", borderRadius: 4,
                      cursor: "pointer", color: "#605e5c", fontSize: "0.6rem",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1, padding: 0,
                    }}
                  >
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                  <div>
                    <div className="rl-name">{region || "Unassigned"}</div>
                    <div className="rl-sub">
                      {isCollapsed
                        ? `${items.length} hidden`
                        : region ? "Cloud Operations" : "Region TBD"}
                    </div>
                  </div>
                  <div className="rl-cap">
                    {limit != null && !isCollapsed && (
                      <div
                        className={"rl-builds " + capState}
                        title="Peak concurrent builds in view / capacity"
                      >
                        {peakBuilds}/{limit} builds
                      </div>
                    )}
                    {!isCollapsed && <div className="rl-hours">{weekHours}h</div>}
                  </div>
                </div>

                <div className="sched-track" style={{ minHeight: trackH }}>
                  <div className="sched-track-bg">
                    {days.map((d, i) => {
                      const iso = fmtISO(d)
                      const cb = cellBlocks(region, iso)
                      const wholeDay = cb.some((bl) => !bl.blockTime)
                      const slotOnly = !wholeDay && cb.length > 0
                      const blockedStyle = wholeDay
                        ? { background: "repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 4px,#f3f4f6 4px,#f3f4f6 8px)" }
                        : slotOnly
                          ? { background: "repeating-linear-gradient(45deg,#eef2ff,#eef2ff 4px,#ffffff 4px,#ffffff 8px)" }
                          : undefined
                      const title = cb.length
                        ? cb.map((bl) => `${bl.blockTime || "All day"}${bl.reason ? " — " + bl.reason : ""}`).join("\n")
                        : undefined
                      return (
                        <div
                          key={i}
                          title={title}
                          className={
                            "sched-bgcell" +
                            (isWeekend(d) ? " weekend" : "") +
                            (sameDay(d, today) ? " today" : "")
                          }
                          style={blockedStyle}
                        />
                      )
                    })}
                  </div>

                  {!isCollapsed && laid.map((b) => {
                    const startIdx = dayDiff(parseISO(b.start), viewStart)
                    const endIdx   = dayDiff(parseISO(b.end),   viewStart)
                    if (endIdx < 0 || startIdx > NUM_DAYS - 1) return null
                    const cs    = Math.max(startIdx, 0)
                    const ce    = Math.min(endIdx, NUM_DAYS - 1)
                    const left  = (cs / NUM_DAYS) * 100
                    const width = ((ce - cs + 1) / NUM_DAYS) * 100
                    const top   = PAD + b.lane * (LANE_H + LANE_GAP)
                    return (
                      <button
                        key={b.id}
                        className={`sched-bar bar-${b.operationType} status-${b.status}`}
                        style={{
                          left: `${left}%`,
                          width: `calc(${width}% - 4px)`,
                          top,
                          height: LANE_H,
                          border: STATUS_BORDER[b.status] || '2px solid #cbd5e1',
                          boxSizing: 'border-box',
                        }}
                        onClick={() => setSelectedId(b.id)}
                      >
                        {/* SNOW case indicator — only meaningful once approved. */}
                        {b.status === 'approved' && (
                          <span
                            title={b.serviceNowCaseId
                              ? `ServiceNow case ${b.serviceNowCaseId}`
                              : 'Approved without a ServiceNow case (manual-entry booking)'}
                            aria-label={b.serviceNowCaseId ? 'ServiceNow case created' : 'No ServiceNow case'}
                            style={{
                              position: 'absolute', top: 6, right: 6,
                              width: 14, height: 14, borderRadius: '50%',
                              background: b.serviceNowCaseId ? '#16a34a' : '#f59e0b',
                              color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              lineHeight: 1,
                              boxShadow: '0 0 0 2px rgba(255,255,255,0.65)',
                            }}
                          >
                            {b.serviceNowCaseId ? '' : '!'}
                          </span>
                        )}
                        <span
                          className="b-title"
                          style={b.status === 'approved'
                            ? { paddingRight: 20, boxSizing: 'border-box' }
                            : undefined}
                        >
                          {b.operationLabel}
                        </span>
                        <span className="b-sub">
                          {[b.companyName, b.environment].filter(Boolean).join(" · ") || "—"}
                        </span>
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

      {!loading && bookings.length === 0 && (
        <div className="sched-empty">No bookings yet.</div>
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

      {showBlocks && isAdmin && (
        <BlockModal
          blocks={blocks}
          onCreate={createBlock}
          onRemove={removeBlk}
          onClose={() => setShowBlocks(false)}
        />
      )}
    </div>
  )
}

// ===========================================================================
// BlockModal – admin blocks a date/slot across one or more regions
// ===========================================================================
function BlockModal({ blocks, onCreate, onRemove, onClose }) {
  const B_INK = '#242424', B_MUTED = '#605e5c', B_BORDER = '#d7d5d2', B_ACCENT = '#e35205'

  const [date, setDate]         = useState('')
  const [regions, setRegions]   = useState([])
  const [wholeDay, setWholeDay] = useState(true)
  const [time, setTime]         = useState('')
  const [reason, setReason]     = useState('')
  const [err, setErr]           = useState('')
  const [busy, setBusy]         = useState(false)

  // Time options = every 30-minute increment across the full day (12:00 AM → 11:30 PM).
  const slotOptions = useMemo(() => {
    const out = []
    for (let mins = 0; mins < 24 * 60; mins += 30) {
      const h24 = Math.floor(mins / 60)
      const m = mins % 60
      const ampm = h24 >= 12 ? 'PM' : 'AM'
      const h12 = ((h24 + 11) % 12) + 1
      out.push(`${h12}:${String(m).padStart(2, '0')} ${ampm}`)
    }
    return out
  }, [])

  const toggleRegion = (r) =>
    setRegions((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))

  async function submit() {
    setErr('')
    if (!date) return setErr('Pick a date')
    if (!regions.length) return setErr('Pick at least one region')
    if (!wholeDay && !time) return setErr('Pick a time or choose whole day')
    setBusy(true)
    try {
      await onCreate({ blockDate: date, blockTime: wholeDay ? null : time, regions, reason })
      setDate(''); setRegions([]); setWholeDay(true); setTime(''); setReason('')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  async function handleRemove(id) {
    setErr('')
    try { await onRemove(id) } catch (e) { setErr(e.message) }
  }

  const sorted = [...blocks].sort(
    (a, b) => a.blockDate.localeCompare(b.blockDate) || (a.blockTime || '').localeCompare(b.blockTime || ''),
  )

  const chip = (on) => ({
    display: 'inline-block', padding: '3px 9px', margin: '2px 4px 2px 0', borderRadius: 4,
    fontSize: '0.75rem', cursor: 'pointer', border: `1px solid ${on ? B_ACCENT : B_BORDER}`,
    background: on ? B_ACCENT : '#fff', color: on ? '#fff' : B_MUTED,
  })
  const box = { padding: '7px 9px', border: `1px solid ${B_BORDER}`, borderRadius: 5, fontSize: '0.85rem' }

  return (
    <div className="sched-overlay" onClick={onClose}>
      <div className="sched-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="sched-modal-head">
          <div><h3>Blocked dates</h3></div>
          <button className="sched-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="sched-modal-body">
          {/* create */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={box} />
            <label style={{ fontSize: '0.8rem', color: B_INK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
              Whole day
            </label>
            {!wholeDay && (
              <select value={time} onChange={(e) => setTime(e.target.value)} style={box}>
                <option value="">Select time…</option>
                {slotOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: '0.75rem', color: B_MUTED, marginRight: 6 }}>Regions:</span>
            {REGIONS.map((r) => (
              <span key={r} style={chip(regions.includes(r))} onClick={() => toggleRegion(r)}>{r}</span>
            ))}
          </div>

          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{ ...box, width: '100%', boxSizing: 'border-box', marginTop: 10 }}
          />

          {err && <p style={{ color: '#c2410c', fontSize: '0.8rem', margin: '10px 0 0' }}>{err}</p>}

          <button
            onClick={submit}
            disabled={busy}
            style={{ marginTop: 12, padding: '7px 12px', borderRadius: 5, border: 'none',
              background: B_ACCENT, color: '#fff', fontWeight: 600, fontSize: '0.82rem',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Adding…' : 'Add block'}
          </button>

          {/* existing */}
          <div style={{ marginTop: 18, borderTop: `1px solid ${B_BORDER}`, paddingTop: 14 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: B_INK, marginBottom: 8 }}>
              Current blocks
            </div>
            {sorted.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: B_MUTED, margin: 0 }}>No blocks set.</p>
            ) : (
              sorted.map((bl) => (
                <div key={bl.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', borderBottom: `1px solid #f0efed`, fontSize: '0.82rem', color: B_INK }}>
                  <span style={{ fontWeight: 600 }}>{fmtDate(bl.blockDate)}</span>
                  <span style={{ color: B_MUTED }}>{bl.blockTime || 'All day'}</span>
                  <span style={{ color: B_MUTED }}>· {bl.regions.join(', ')}</span>
                  {bl.reason && <span style={{ color: B_MUTED }}>· {bl.reason}</span>}
                  <button
                    onClick={() => handleRemove(bl.id)}
                    style={{ marginLeft: 'auto', border: `1px solid ${B_BORDER}`, background: '#fff',
                      borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', padding: '2px 8px', color: B_INK }}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// DetailModal
// ===========================================================================
function DetailModal({ b, onSave, onDelete, onClose }) {
  const isBuild  = b.operationType === "build"
  const pickTime = b.operationType !== "build"

  const [companyName, setCompanyName] = useState(b.companyName || "")
  const [start,     setStart]     = useState(b.start)
  const [end,       setEnd]       = useState(b.end)
  const [startTime, setStartTime] = useState(b.startTime || "")
  const [notes,     setNotes]     = useState(b.privateNotes || "")
  const [region,    setRegion]    = useState(b.region)

  const endTime     = pickTime && startTime ? computeEndTime(startTime, b.durationHours) : b.endTime
  const workingDays = isBuild ? Math.max(1, countWeekdays(start, end)) : 1
  const hoursPerDay = Math.round((b.durationHours / workingDays) * 10) / 10
  const slots       = region ? (REGION_SLOTS[region] || []) : []

  function onStartChange(iso) {
    if (!iso) return
    if (isBuild) {
      const delta = dayDiff(parseISO(iso), parseISO(start))
      setEnd(fmtISO(addDays(parseISO(end), delta)))
      setStart(iso)
    } else {
      setStart(iso)
      setEnd(iso)
    }
  }

  function save() {
    onSave({
      company_name:   companyName || null,
      scheduled_date: start,
      region:         region || null,
      notes:          notes || null,
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
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => onStartChange(e.target.value)}
                  />
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
                <select
                  value={slots.includes(startTime) ? startTime : ""}
                  onChange={(e) => setStartTime(e.target.value)}
                >
                  {!slots.includes(startTime) && (
                    <option value="">{startTime || "—"}</option>
                  )}
                  {slots.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="muted">– {endTime}</span>
              </div>
            )}
          </div>

          <div className="alloc-field">
            <label>Company name</label>
            <input
              className="alloc-box"
              placeholder="— no company —"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="alloc-field">
            <label>Environment</label>
            <div className="alloc-box ro">
              {b.environment || "—"}
              {b.cid && <span style={{ color: "#605e5c" }}> · {b.cid}</span>}
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
            <label>Region</label>
            <select
              className="alloc-box"
              value={region || ""}
              onChange={(e) => setRegion(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {b.bookerName && (
            <div className="alloc-meta">Booked by {b.bookerName}</div>
          )}
        </div>

        <div className="alloc-buttons">
          <button className="btn-update" onClick={save}>Update</button>
          <button className="btn-light" onClick={onClose}>Close</button>
          <span className="spacer" />
          <button
            className="btn-link danger"
            onClick={() => { onDelete(); onClose() }}
          >
            Delete booking
          </button>
        </div>
      </div>
    </div>
  )
}