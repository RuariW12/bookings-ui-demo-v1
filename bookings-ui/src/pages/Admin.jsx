import { useState, useEffect } from 'react'
import { listUsers, addUser, updateUser, setActive, REGIONS } from '../lib/userStore'

const INK = '#242424', MUTED = '#605e5c', BORDER = '#d7d5d2'
const HAIRLINE = '#e6e4e2', ACCENT = '#e35205', SURFACE = '#f3f2f1'

export default function Admin() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('requester')
  const [newRegions, setNewRegions] = useState([])

  const [editing, setEditing] = useState(null)
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
      await addUser({ email, role, regions: newRegions, displayName: name })
      setEmail(''); setName(''); setRole('requester'); setNewRegions([])
      refresh()
    } catch (e) { setError(e.message) }
  }
  async function handleToggleActive(u) {
    setError('')
    try { await setActive(u.email, !u.active); refresh() }
    catch (e) { setError(e.message) }
  }
  function startEdit(u) { setEditing(u.email); setEditRegions(u.regions) }
  async function saveEdit(u) {
    setError('')
    try { await updateUser(u.email, { regions: editRegions }); setEditing(null); refresh() }
    catch (e) { setError(e.message) }
  }

  const cell = { padding: '8px 10px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: '0.85rem', color: INK, verticalAlign: 'top' }
  const chip = (on) => ({
    display: 'inline-block', padding: '2px 7px', margin: '1px 3px 1px 0', borderRadius: 4,
    fontSize: '0.72rem', cursor: 'pointer', border: `1px solid ${on ? ACCENT : BORDER}`,
    background: on ? ACCENT : '#fff', color: on ? '#fff' : MUTED,
  })
  const btn = { padding: '5px 10px', fontSize: '0.78rem', borderRadius: 5, cursor: 'pointer', border: `1px solid ${BORDER}`, background: '#fff', color: INK }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.1rem', color: INK, margin: '0 0 4px' }}>User administration</h2>
      <p style={{ fontSize: '0.85rem', color: MUTED, margin: '0 0 18px' }}>
        Manage approvers and requesters. Admins are seeded and shown read-only.
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
          </select>
        </div>
        {role === 'approver' && (
          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: '0.75rem', color: MUTED, marginRight: 6 }}>Regions:</span>
            {REGIONS.map((r) => (
              <span key={r} style={chip(newRegions.includes(r))} onClick={() => toggle(newRegions, setNewRegions, r)}>{r}</span>
            ))}
          </div>
        )}
        <button onClick={handleAdd} style={{ ...btn, marginTop: 12, background: ACCENT, color: '#fff', border: 'none', fontWeight: 600 }}>
          Add user
        </button>
      </div>

      {error && <p style={{ color: '#c2410c', fontSize: '0.8rem', margin: '0 0 12px' }}>{error}</p>}

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
            {users.map((u) => {
              const isEditing = editing === u.email
              return (
                <tr key={u.email} style={{ opacity: u.active ? 1 : 0.5 }}>
                  <td style={cell}>
                    <div style={{ fontWeight: 600 }}>{u.displayName || u.email.split('@')[0]}</div>
                    <div style={{ color: MUTED, fontSize: '0.75rem' }}>{u.email}</div>
                  </td>
                  <td style={cell}>
                    {u.role}{u.seeded && <span style={{ color: MUTED }}> 🔒</span>}
                  </td>
                  <td style={cell}>
                    {u.role === 'requester' ? <span style={{ color: MUTED }}>—</span>
                      : isEditing ? REGIONS.map((r) => (
                          <span key={r} style={chip(editRegions.includes(r))} onClick={() => toggle(editRegions, setEditRegions, r)}>{r}</span>
                        ))
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
                        {u.role === 'approver' && (
                          <button onClick={() => startEdit(u)} style={{ ...btn, marginRight: 5 }}>Edit regions</button>
                        )}
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
  )
}