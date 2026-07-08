// Approvals.jsx

import { useState, useMemo, useEffect, Fragment } from 'react'
import { useAuth } from '../lib/auth'
import { listEmployees } from '../lib/employees'
import './approvals.css'

const OP_LABELS = { build: 'Environment Build', refresh: 'MD Refresh', cutover: 'Cutover' }

const STATUS_LABELS = {
  pending:   'Pending',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
}

const FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled']

// Assignment status → row accent. Approved+assigned green, approved+unassigned
// orange (the flag), everything not-approved a neutral gray.
const ASSIGN_ACCENT = { assigned: '#16a34a', unassigned: '#d97706', na: '#9ca3af' }
const ASSIGN_TINT   = { assigned: 'rgba(22,163,74,0.05)', unassigned: 'rgba(217,119,6,0.06)', na: 'transparent' }
function assignState(b) {
  if (b.status !== 'approved') return 'na'
  return b.assignees && b.assignees.length ? 'assigned' : 'unassigned'
}

// Backend booking (snake_case) → the shape this component renders.
function toUI(b) {
  return {
    id: b.id,
    operationType: b.operation_type,
    operationLabel: OP_LABELS[b.operation_type] || b.operation_type,
    title: b.company_name || '—',
    cid: b.company_id || '',
    region: b.region,
    start: b.scheduled_date,
    end: null,
    startTime: b.scheduled_time || '',
    endTime: '',
    environment: b.environment_name || '',
    environmentId: b.environment_id || '',
    status: b.status,
    serviceNowCaseId: b.servicenow_case_id || '',
    assignees: Array.isArray(b.assignees) ? b.assignees : [],
    submittedBy: b.requester_email || '',
    submittedAt: b.created_at || '',
    csm: b.requester_name || '',
    csmEmail: b.requester_email || '',
    notes: b.notes || '',
    approvedBy: b.status === 'approved' ? (b.approved_by || '') : '',
    approvedAt: b.status === 'approved' ? (b.approved_at || '') : '',
    rejectedBy: b.status === 'rejected' ? (b.approved_by || '') : '',
    rejectedAt: b.status === 'rejected' ? (b.approved_at || '') : '',
    rejectionReason: '',
  }
}

async function readError(res) {
  try {
    const body = await res.json()
    return body.detail || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}


export default function Approvals() {
  // ── state ──
  const { user, canApproveRegion } = useAuth()
  const currentUser = user
  const userIsApprover = !!user?.isApprover
  const userIsAdmin = !!user?.isAdmin
  const canReview = userIsApprover || userIsAdmin
  const approverRegions = user?.approverRegions ?? []

  // Both admins and approvers act only within their scoped regions.
  // Wildcard '*' (all regions) is handled inside canApproveRegion.
  const canActOn = (b) => canReview && canApproveRegion(b.region)

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)     // booking id or null
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [assigningId, setAssigningId] = useState(null)   // booking id being assigned

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      if (!res.ok) throw new Error(await readError(res))
      const data = await res.json()
      setBookings(data.map(toUI))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  // ── derived ──
  const counts = useMemo(() => {
    const c = { all: bookings.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 }
    bookings.forEach(b => { if (c[b.status] !== undefined) c[b.status]++ })
    return c
  }, [bookings])

  const filtered = useMemo(() => {
    const list = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)
    // Pending first, then most-recently-submitted first
    return [...list].sort((a, b) => {
      const rank = { pending: 0, approved: 1, rejected: 1, cancelled: 2 }
      const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
      if (r !== 0) return r
      return (b.submittedAt || '').localeCompare(a.submittedAt || '')
    })
  }, [bookings, filter])

  const assigningBooking = bookings.find(b => b.id === assigningId) || null

  // ── actions ──
  async function handleApprove(id) {
    const target = bookings.find(b => b.id === id)
    if (!target || !canActOn(target)) return
    setError('')
    try {
      const res = await fetch(
        `/api/bookings/${id}/approve?approver_email=${encodeURIComponent(currentUser.email)}`,
        { method: 'PATCH' }
      )
      if (!res.ok) throw new Error(await readError(res))
      const updated = toUI(await res.json())
      setBookings(prev => prev.map(b => b.id === id ? updated : b))
      setAssigningId(id)   // prompt assignment right after a successful approve
    } catch (e) {
      setError(e.message)
    }
    // TODO: notifyRequester(booking) — send Outlook email to submitter
  }

  async function handleReject(id) {
    const target = bookings.find(b => b.id === id)
    if (!target || !canActOn(target)) return
    setError('')
    try {
      const res = await fetch(
        `/api/bookings/${id}/reject?approver_email=${encodeURIComponent(currentUser.email)}`,
        { method: 'PATCH' }
      )
      if (!res.ok) throw new Error(await readError(res))
      const updated = toUI(await res.json())
      setBookings(prev => prev.map(b => b.id === id ? updated : b))
    } catch (e) {
      setError(e.message)
    }
    setRejectingId(null)
    setRejectReason('')
    // TODO: notifyRequester(booking) — send Outlook email with reason
  }

  // Full-replace assignment. Throws on failure so the modal can surface it.
  async function saveAssignees(id, assignees) {
    const res = await fetch(
      `/api/bookings/${id}/assign?approver_email=${encodeURIComponent(currentUser.email)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignees }),
      }
    )
    if (!res.ok) throw new Error(await readError(res))
    const updated = toUI(await res.json())
    setBookings(prev => prev.map(b => b.id === id ? updated : b))
  }

  // ── render ──
  return (
    <div className="approvals">

      {/* Status filter tabs */}
      <div className="approval-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={'filter-tab' + (filter === f ? ' active' : '')}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]}
            <span className="filter-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {canReview && (
        <div className="meta-text" style={{ margin: '4px 2px 10px' }}>
          Approving for: <strong>{approverRegions.includes('*') ? 'all regions' : (approverRegions.join(', ') || '—')}</strong>
        </div>
      )}

      {error && <div className="meta-text" style={{ color: '#c2410c', margin: '0 2px 10px' }}>{error}</div>}

      {loading ? (
        <div className="approvals-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="approvals-empty">
          No {filter === 'all' ? '' : filter} bookings to show.
        </div>
      ) : (
        <table className="approvals-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Title / Customer</th>
              <th>Region</th>
              <th>Date</th>
              <th>Status</th>
              <th>Submitted</th>
              {canReview && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => {
              const aState = assignState(b)
              return (
              <Fragment key={b.id}>
                <tr
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  style={{ cursor: 'pointer', background: ASSIGN_TINT[aState] }}
                >
                  <td style={{ borderLeft: `4px solid ${ASSIGN_ACCENT[aState]}` }}>
                    <span className={'op-pill ' + b.operationType}>{b.operationLabel}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.title}</div>
                    <div className="meta-text">{b.cid}</div>
                  </td>
                  <td>{b.region}</td>
                  <td className="col-date">
                    <div>{formatDate(b.start)}</div>
                    {b.end && b.end !== b.start && (
                      <div className="meta-text">→ {formatDate(b.end)}</div>
                    )}
                  </td>
                  <td>
                    <span className={'status-badge ' + b.status}>
                      <span className="dot" />
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                    {b.status === 'approved' && !b.serviceNowCaseId && (
                      <span className="no-case-badge" title="Approved without a ServiceNow case (manual-entry booking)">
                        No SNOW case
                      </span>
                    )}
                    {b.status === 'approved' && b.assignees.length === 0 && (
                      <span
                        title="Approved but nobody is assigned yet"
                        style={{
                          display: 'inline-block', marginLeft: 6, padding: '1px 7px',
                          borderRadius: 10, fontSize: '0.68rem', fontWeight: 600,
                          background: '#fed7aa', color: '#9a3412', whiteSpace: 'nowrap',
                        }}
                      >
                        Unassigned
                      </span>
                    )}
                  </td>
                  <td className="col-submitted">
                    <div className="meta-text">{b.submittedBy ? b.submittedBy.split('@')[0].replace('.', ' ') : '—'}</div>
                    {b.submittedAt && <div className="meta-text">{formatTimestamp(b.submittedAt)}</div>}
                  </td>
                  {canReview && (
                    <td className="col-actions" onClick={e => e.stopPropagation()}>
                      {b.status === 'pending' ? (
                        canActOn(b) ? (
                          <div className="approval-actions">
                            <button className="btn-approve" onClick={() => handleApprove(b.id)}>Approve</button>
                            <button className="btn-reject" onClick={() => setRejectingId(rejectingId === b.id ? null : b.id)}>Reject</button>
                          </div>
                        ) : (
                          <span className="meta-text" title={'You can only approve: ' + (approverRegions.includes('*') ? 'all regions' : approverRegions.join(', '))}>
                            {b.region} — outside your region
                          </span>
                        )
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <span className="meta-text">
                            {b.approvedBy && <>Approved by {b.approvedBy.split('@')[0].replace('.', ' ')}</>}
                            {b.rejectedBy && <>Rejected by {b.rejectedBy.split('@')[0].replace('.', ' ')}</>}
                          </span>
                          {b.status === 'approved' && canActOn(b) && (
                            <button
                              onClick={() => setAssigningId(b.id)}
                              style={{
                                border: '1px solid #d7d5d2', background: '#fff', borderRadius: 5,
                                padding: '3px 9px', fontSize: '0.75rem', cursor: 'pointer', color: '#242424',
                              }}
                            >
                              {b.assignees.length ? `Assignees (${b.assignees.length})` : 'Assign'}
                            </button>
                          )}
                        </div>
                      )}
                      {rejectingId === b.id && canActOn(b) && (
                        <div className="reject-form">
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleReject(b.id)}
                            autoFocus
                          />
                          <button className="reject-confirm" onClick={() => handleReject(b.id)}>Confirm</button>
                          <button className="reject-cancel" onClick={() => { setRejectingId(null); setRejectReason('') }}>Cancel</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>

                {/* Expandable detail row */}
                {expanded === b.id && (
                  <tr key={b.id + '-detail'} className="detail-row">
                    <td colSpan={canReview ? 7 : 6}>
                      <dl className="detail-grid">
                        <div><dt>Environment</dt><dd>{b.environment || '—'}</dd></div>
                        <div><dt>Environment ID</dt><dd>{b.environmentId || '—'}</dd></div>
                        <div><dt>SNOW Case</dt><dd>{b.serviceNowCaseId || '— none —'}</dd></div>
                        <div><dt>Start Time</dt><dd>{b.startTime || '—'}</dd></div>
                        <div><dt>End Time</dt><dd>{b.endTime || '—'}</dd></div>
                        <div><dt>CSM</dt><dd>{b.csm || '—'}</dd></div>
                        <div><dt>CSM Email</dt><dd>{b.csmEmail || '—'}</dd></div>
                        {b.status === 'approved' && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <dt>Assigned to</dt>
                            <dd>
                              {b.assignees.length
                                ? b.assignees.map(a => `${a.name}${a.region ? ` (${a.region})` : ''}`).join(', ')
                                : '— none —'}
                            </dd>
                          </div>
                        )}
                        {b.notes && <div style={{ gridColumn: '1 / -1' }}><dt>Notes</dt><dd>{b.notes}</dd></div>}
                        {b.rejectionReason && <div style={{ gridColumn: '1 / -1' }}><dt>Rejection Reason</dt><dd>{b.rejectionReason}</dd></div>}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      {assigningBooking && (
        <AssignModal
          booking={assigningBooking}
          onSave={(assignees) => saveAssignees(assigningBooking.id, assignees)}
          onClose={() => setAssigningId(null)}
        />
      )}
    </div>
  )
}

// ===========================================================================
// AssignModal – staff an approved case from the region-grouped roster
// ===========================================================================
function AssignModal({ booking, onSave, onClose }) {
  const [all, setAll]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState('')
  const [regionFilter, setRegionFilter] = useState(booking.region || 'all')
  const [search, setSearch]     = useState('')
  const [busy, setBusy]         = useState(false)
  // selected keyed by email → {name,email,region}
  const [selected, setSelected] = useState(() => {
    const m = new Map()
    ;(booking.assignees || []).forEach(a => m.set(a.email, a))
    return m
  })

  useEffect(() => {
    listEmployees()
      .then(setAll)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const regions = useMemo(() => [...new Set(all.map(e => e.region).filter(Boolean))], [all])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(e => {
      if (regionFilter !== 'all' && e.region !== regionFilter) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
    })
  }, [all, regionFilter, search])

  const toggle = (e) => {
    setSelected(prev => {
      const m = new Map(prev)
      if (m.has(e.email)) m.delete(e.email)
      else m.set(e.email, { name: e.name, email: e.email, region: e.region })
      return m
    })
  }

  async function save() {
    setErr('')
    setBusy(true)
    try {
      await onSave([...selected.values()])
      onClose()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
  }
  const modal = {
    background: '#fff', borderRadius: 10, width: 'min(560px, 94vw)', maxHeight: '84vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  }
  const box = { padding: '7px 9px', border: '1px solid #d7d5d2', borderRadius: 6, fontSize: '0.85rem' }
  const selectedList = [...selected.values()]

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e6e4e2', display: 'flex', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#242424' }}>Assign staff</h3>
            <div style={{ fontSize: '0.78rem', color: '#605e5c', marginTop: 2 }}>
              {booking.title} · {booking.operationLabel} · {booking.region}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#605e5c', lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBottom: '1px solid #f0efed' }}>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={box}>
            <option value="all">All regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            style={{ ...box, flex: 1 }}
          />
        </div>

        {/* roster */}
        <div style={{ overflowY: 'auto', padding: '6px 8px', flex: 1, minHeight: 120 }}>
          {loading ? (
            <div style={{ padding: 16, color: '#605e5c', fontSize: '0.85rem' }}>Loading roster…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 16, color: '#605e5c', fontSize: '0.85rem' }}>No matches.</div>
          ) : (
            visible.map(e => {
              const on = selected.has(e.email)
              return (
                <label
                  key={e.email}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                    borderRadius: 6, cursor: 'pointer', background: on ? 'rgba(22,163,74,0.07)' : 'transparent',
                  }}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(e)} />
                  <span style={{ fontSize: '0.86rem', color: '#242424', fontWeight: 600 }}>{e.name}</span>
                  <span style={{ fontSize: '0.76rem', color: '#605e5c' }}>{e.email}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#605e5c' }}>{e.region}</span>
                </label>
              )
            })
          )}
        </div>

        {err && <div style={{ padding: '6px 16px', color: '#c2410c', fontSize: '0.8rem' }}>{err}</div>}

        <div style={{ padding: '12px 16px', borderTop: '1px solid #e6e4e2', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.78rem', color: '#605e5c' }}>
            {selectedList.length ? `${selectedList.length} selected` : 'None selected'}
          </span>
          <span style={{ marginLeft: 'auto' }} />
          <button
            onClick={onClose}
            style={{ border: '1px solid #d7d5d2', background: '#fff', borderRadius: 6, padding: '7px 12px', fontSize: '0.82rem', cursor: 'pointer', color: '#242424' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            style={{ border: 'none', background: '#e35205', color: '#fff', borderRadius: 6, padding: '7px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      </div>
    </div>
  )
}