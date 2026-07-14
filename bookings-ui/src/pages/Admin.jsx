import { useState, useEffect } from 'react'
import { listUsers, addUser, updateUser, setActive, REGIONS } from '../lib/userStore'
import { useAuth } from '../lib/auth'

const INK = '#242424', MUTED = '#605e5c', BORDER = '#d7d5d2'
const HAIRLINE = '#e6e4e2', ACCENT = '#e35205', SURFACE = '#f3f2f1'

const ROLES = ['requester', 'approver', 'admin']

export default function Admin() {
  const { user } = useAuth()
  const actorEmail = user?.email || ''
  const actorRegions = user?.approverRegions ?? []
  // Regions this admin may assign. A '*' wildcard means all regions.
  const allowedRegions = actorRegions.includes('*') ? REGIONS : actorRegions
  // Approvers can be assigned any region; admins stay scoped to the acting admin's regions.
  const regionChoices = (r) => (r === 'approver' ? REGIONS : allowedRegions)

  const [search, setSearch] = useState('')

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('requester')
  const [newRegions, setNewRegions] = useState([])

  const [editing, setEditing] = useState(null)     // user email being edited
  const [editRole, setEditRole] = useState('')
  const [editRegions, setEditRegions] = useState([])

  async function refresh() {
    setLoading(true)
    try { setUsers(await listUsers()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const toggle = (arr, set, val) =>
    set(arr.includes(val) ? arr.filter((r) => r !== val) : [...arr, val])

  async function handleAdd() {
    setError('')
    try {
      await addUser({ email, role, regions: newRegions, displayName: name }, actorEmail)
      setEmail(''); setName(''); setRole('requester'); setNewRegions([])
      refresh()
    } catch (e) { setError(e.message) }
  }
  async function handleToggleActive(u) {
    setError('')
    try { await setActive(u.email, !u.active, actorEmail); refresh() }
    catch (e) { setError(e.message) }
  }
  function startEdit(u) {
    setEditing(u.email)
    setEditRole(u.role)
    setEditRegions(u.regions)
  }
  async function saveEdit(u) {
    setError('')
    const patch = { role: editRole, regions: editRole === 'requester' ? [] : editRegions }
    try { await updateUser(u.email, patch, actorEmail); setEditing(null); refresh() }
    catch (e) { setError(e.message) }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const name = (u.displayName || u.email.split('@')[0]).toLowerCase()
    return name.includes(q) || u.email.toLowerCase().includes(q)
  })

  const cell = { padding: '8px 10px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: '0.85rem', color: INK, verticalAlign: 'top' }
  const chip = (on) => ({
    display: 'inline-block', padding: '2px 7px', margin: '1px 3px 1px 0', borderRadius: 4,
    fontSize: '0.72rem', cursor: 'pointer', border: `1px solid ${on ? ACCENT : BORDER}`,
    background: on ? ACCENT : '#fff', color: on ? '#fff' : MUTED,
  })
  const btn = { padding: '5px 10px', fontSize: '0.78rem', borderRadius: 5, cursor: 'pointer', border: `1px solid ${BORDER}`, background: '#fff', color: INK }
  const sel = { padding: '4px 6px', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: '0.78rem', color: INK }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', paddingTop: 24, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Left column — everything else */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: '1.1rem', color: INK, margin: '0 0 4px' }}>User administration</h2>
        <p style={{ fontSize: '0.85rem', color: MUTED, margin: '0 0 18px' }}>
          Manage requesters, approvers, and admins within your regions. Seeded accounts are read-only.
        </p>

        {/* Add user */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: INK, marginBottom: 10 }}>Add a user</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="work email"
              style={{ flex: '1 1 200px', padding: '7px 9px', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: '0.85rem' }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="display name"
              style={{ flex: '1 1 140px', padding: '7px 9px', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: '0.85rem' }} />
            <select value={role} onChange={(e) => setRole(e.target.value)}
              style={{ padding: '7px 9px', border: `1px solid ${BORDER}`, borderRadius: 5, fontSize: '0.85rem' }}>
              <option value="requester">Requester</option>
              <option value="approver">Approver</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role !== 'requester' && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: '0.75rem', color: MUTED, marginRight: 6 }}>Regions:</span>
              {regionChoices(role).map((r) => (
                <span key={r} style={chip(newRegions.includes(r))} onClick={() => toggle(newRegions, setNewRegions, r)}>{r}</span>
              ))}
            </div>
          )}
          <button onClick={handleAdd} style={{ ...btn, marginTop: 12, background: ACCENT, color: '#fff', border: 'none', fontWeight: 600 }}>
            Add user
          </button>
        </div>

        {error && <p style={{ color: '#c2410c', fontSize: '0.8rem', margin: '0 0 12px' }}>{error}</p>}

        {/* Search */}
        {!loading && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by name…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', marginBottom: 10,
              border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: '0.85rem' }} />
        )}

        {/* User table */}
        {loading ? (
          <p style={{ color: MUTED, fontSize: '0.85rem' }}>Loading…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: SURFACE }}>
                {['User', 'Role', 'Regions', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ ...cell, fontWeight: 600, color: MUTED, textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isEditing = editing === u.email
                return (
                  <tr key={u.email} style={{ opacity: u.active ? 1 : 0.5 }}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{u.displayName || u.email.split('@')[0]}</div>
                      <div style={{ color: MUTED, fontSize: '0.75rem' }}>{u.email}</div>
                    </td>
                    <td style={cell}>
                      {isEditing && !u.seeded ? (
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)} style={sel}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <>{u.role}{u.seeded && <span style={{ color: MUTED }}> 🔒</span>}</>
                      )}
                    </td>
                    <td style={cell}>
                      {isEditing && editRole !== 'requester' ? regionChoices(editRole).map((r) => (
                          <span key={r} style={chip(editRegions.includes(r))} onClick={() => toggle(editRegions, setEditRegions, r)}>{r}</span>
                        ))
                        : u.role === 'requester' ? <span style={{ color: MUTED }}>—</span>
                        : (u.regions.join(', ') || <span style={{ color: MUTED }}>none</span>)}
                    </td>
                    <td style={cell}>{u.active ? 'Active' : 'Inactive'}</td>
                    <td style={cell}>
                      {u.seeded ? <span style={{ color: MUTED, fontSize: '0.78rem' }}>seeded</span> : isEditing ? (
                        <>
                          <button onClick={() => saveEdit(u)} style={{ ...btn, marginRight: 5 }}>Save</button>
                          <button onClick={() => setEditing(null)} style={btn}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(u)} style={{ ...btn, marginRight: 5 }}>Edit</button>
                          <button onClick={() => handleToggleActive(u)} style={btn}>
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Right column — role descriptions */}
      <aside style={{ flex: '0 0 260px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: '14px 16px', top: 24 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: INK, marginBottom: 12 }}>What each role can do</div>
        <div style={{ fontSize: '0.8rem', color: MUTED, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><strong style={{ color: INK }}>Requester</strong> — books Parallel Build work. No approval or admin rights.</div>
          <div><strong style={{ color: INK }}>Approver</strong> — approves/rejects bookings and staffs them, within their assigned regions.</div>
          <div><strong style={{ color: INK }}>Admin</strong> — everything an approver does, plus manages users and blocks dates — all scoped to the regions they hold.</div>
        </div>
      </aside>
    </div>
  )
}