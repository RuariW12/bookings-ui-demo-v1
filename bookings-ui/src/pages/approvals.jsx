// Approvals.jsx

import { useState, useMemo, Fragment } from 'react'
import { SEED_BOOKINGS } from '../lib/bookings'
import { isApprover } from '../lib/approvers'
import './approvals.css'

// ── demo users for testing (remove when auth context exists) ──
const DEMO_USERS = [
  { name: 'John Smith',     email: 'johnsmith123@example.com',  role: 'requester' },
  { name: 'Jane Doe',       email: 'janedoe123@example.com',    role: 'requester' },
  { name: 'Tanner G.', email: 'theboss@example.com',       role: 'approver'  },
]

// ── extra seed entries that are pending approval (demo data) ──
const PENDING_SEEDS = [
  {
    id: 'pb-0020',
    status: 'pending',
    region: 'CLD-HQ',
    operationType: 'build',
    operationLabel: 'Environment Build',
    title: 'Contoso Corp — PROD build',
    cid: 'CID-44210',
    environment: 'PROD',
    environmentId: 'env-90421',
    start: '2026-07-06',
    end: '2026-07-10',
    startTime: '10:00 AM',
    endTime: '',
    csm: 'Jane Doe',
    csmEmail: 'janedoe123@example.com',
    submittedBy: 'janedoe123@example.com',
    submittedAt: '2026-06-23T14:22:00Z',
    notes: 'Customer requesting PROD build ahead of Q3 go-live.',
  },
  {
    id: 'pb-0021',
    status: 'pending',
    region: 'CLD-EMEA',
    operationType: 'refresh',
    operationLabel: 'MD Refresh',
    title: 'Fabrikam Ltd — DEV refresh',
    cid: 'CID-33105',
    environment: 'DEV',
    environmentId: 'env-71803',
    start: '2026-07-02',
    end: '2026-07-02',
    startTime: '4:00 AM',
    endTime: '12:00 PM',
    csm: 'John Smith',
    csmEmail: 'johnsmith123@example.com',
    submittedBy: 'johnsmith123@example.com',
    submittedAt: '2026-06-24T09:15:00Z',
    notes: '',
  },
  {
    id: 'pb-0022',
    status: 'pending',
    region: 'CLD-CTC',
    operationType: 'cutover',
    operationLabel: 'Cutover',
    title: 'Northwind Traders — PROD cutover',
    cid: 'CID-55987',
    environment: 'PROD',
    environmentId: 'env-30112',
    start: '2026-07-08',
    end: '2026-07-08',
    startTime: '10:00 PM',
    endTime: '12:00 AM',
    csm: 'Jane Doe',
    csmEmail: 'janedoe123@example.com',
    submittedBy: 'janedoe123@example.com',
    submittedAt: '2026-06-24T11:40:00Z',
    notes: 'Weekend cutover, customer confirmed downtime window.',
  },
]

const STATUS_LABELS = {
  pending:   'Pending',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
}

const FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled']

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
  const [demoIdx, setDemoIdx] = useState(0)
  const currentUser = DEMO_USERS[demoIdx]
  const userIsApprover = isApprover(currentUser.email)

  const [bookings, setBookings] = useState(() => {
    const normalized = SEED_BOOKINGS.map(b => ({
      ...b,
      submittedBy: b.submittedBy || b.csmEmail || '',
      submittedAt: b.submittedAt || '',
    }))
    return [...normalized, ...PENDING_SEEDS]
  })

  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)     // booking id or null
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

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
  function handleApprove(id) {
    setBookings(prev => prev.map(b =>
      b.id === id
        ? { ...b, status: 'approved', approvedBy: currentUser.email, approvedAt: new Date().toISOString() }
        : b
    ))
    // TODO: notifyRequester(booking) — send Outlook email to submitter
  }

  function handleReject(id) {
    setBookings(prev => prev.map(b =>
      b.id === id
        ? { ...b, status: 'rejected', rejectedBy: currentUser.email, rejectedAt: new Date().toISOString(), rejectionReason: rejectReason }
        : b
    ))
    setRejectingId(null)
    setRejectReason('')
    // TODO: notifyRequester(booking) — send Outlook email with reason
  }

  // ── render ──
  return (
    <div className="approvals">

      {/* Demo user picker — remove when real auth lands */}
      <div className="approvals-demo-bar">
        <span>⚠ Demo mode — viewing as:</span>
        <select value={demoIdx} onChange={e => { setDemoIdx(+e.target.value); setRejectingId(null) }}>
          {DEMO_USERS.map((u, i) => (
            <option key={u.email} value={i}>{u.name} ({u.role})</option>
          ))}
        </select>
      </div>

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

      {filtered.length === 0 ? (
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
              {userIsApprover && <th>Actions</th>}
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
                  {userIsApprover && (
                    <td className="col-actions" onClick={e => e.stopPropagation()}>
                      {b.status === 'pending' ? (
                        <div className="approval-actions">
                          <button className="btn-approve" onClick={() => handleApprove(b.id)}>Approve</button>
                          <button className="btn-reject" onClick={() => setRejectingId(rejectingId === b.id ? null : b.id)}>Reject</button>
                        </div>
                      ) : (
                        <span className="meta-text">
                          {b.approvedBy && <>Approved by {b.approvedBy.split('@')[0].replace('.', ' ')}</>}
                          {b.rejectedBy && <>Rejected by {b.rejectedBy.split('@')[0].replace('.', ' ')}</>}
                        </span>
                      )}
                      {rejectingId === b.id && (
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
                    <td colSpan={userIsApprover ? 7 : 6}>
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