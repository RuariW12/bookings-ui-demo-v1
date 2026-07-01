// Approvals.jsx

import { useState, useMemo, useEffect, Fragment } from 'react'
import { useAuth } from '../lib/auth'
import './approvals.css'

const OP_LABELS = { build: 'Environment Build', refresh: 'MD Refresh', cutover: 'Cutover' }

const STATUS_LABELS = {
  pending:   'Pending',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
}

const FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled']

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
            {filtered.map(b => (
              <Fragment key={b.id}>
                <tr
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
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
                        <span className="meta-text">
                          {b.approvedBy && <>Approved by {b.approvedBy.split('@')[0].replace('.', ' ')}</>}
                          {b.rejectedBy && <>Rejected by {b.rejectedBy.split('@')[0].replace('.', ' ')}</>}
                        </span>
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
                        <div><dt>Start Time</dt><dd>{b.startTime || '—'}</dd></div>
                        <div><dt>End Time</dt><dd>{b.endTime || '—'}</dd></div>
                        <div><dt>CSM</dt><dd>{b.csm || '—'}</dd></div>
                        <div><dt>CSM Email</dt><dd>{b.csmEmail || '—'}</dd></div>
                        {b.notes && <div style={{ gridColumn: '1 / -1' }}><dt>Notes</dt><dd>{b.notes}</dd></div>}
                        {b.rejectionReason && <div style={{ gridColumn: '1 / -1' }}><dt>Rejection Reason</dt><dd>{b.rejectionReason}</dd></div>}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}