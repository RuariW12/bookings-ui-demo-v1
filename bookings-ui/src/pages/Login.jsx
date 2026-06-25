import { useState } from 'react'
import { useAuth } from '../lib/auth'
import strategyLogo from '../assets/strategy.jpg'
import './App.css'

const ALLOWED_DOMAINS = ['strategy.com', 'microstrategy.com']

// Demo logins. The approver email is in approvers.js, so isApprover() resolves
// the role automatically — no separate role list to keep in sync.
const QUICK_LOGINS = [
  { email: 'requester@strategy.com', name: 'Requester', label: 'Sign in as a requester' },
  { email: 'rwhalen@strategy.com', name: 'Ruari Whalen', label: 'Sign in as an approver' },
]

function deriveName(email) {
  const local = email.split('@')[0]
  return local.charAt(0).toUpperCase() + local.slice(1)
}

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  function attempt(value, name) {
    const v = (value || '').toLowerCase().trim()
    if (!v) return
    const domain = v.split('@')[1]
    if (!v.includes('@') || !ALLOWED_DOMAINS.includes(domain)) {
      setError('Sign in with a Strategy account (@strategy.com or @microstrategy.com).')
      return
    }
    setError('')
    signIn(v, name || deriveName(v))
  }

  return (
    <div className="page">
      <header className="brand-header">
        <img src={strategyLogo} className="logo-img" alt="Strategy" />
        <h1 className="brand-title">Strategy</h1>
      </header>

      <main className="content">
        <div className="service-card" style={{ maxWidth: 380, margin: '0 auto', padding: 24 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#242424' }}>
            Sign in to continue
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: '#605e5c' }}>
            Booking and approvals are limited to Strategy staff.
          </p>

          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4, color: '#242424' }}>
            Work email
          </label>
          <input
            type="email"
            value={email}
            placeholder="you@strategy.com"
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && attempt(email)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: '0.9rem',
              border: `1px solid ${error ? '#c2410c' : '#c8c6c4'}`, borderRadius: 4,
            }}
          />
          {error && <p style={{ color: '#c2410c', fontSize: '0.75rem', margin: '6px 0 0' }}>{error}</p>}

          <button
            type="button"
            onClick={() => attempt(email)}
            style={{
              width: '100%', marginTop: 14, padding: '9px 0', fontSize: '0.9rem', fontWeight: 600,
              color: '#fff', background: '#e35205', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Continue
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <span style={{ flex: 1, height: 1, background: '#e1dfdd' }} />
            <span style={{ fontSize: '0.72rem', color: '#605e5c' }}>or try the demo</span>
            <span style={{ flex: 1, height: 1, background: '#e1dfdd' }} />
          </div>

          {QUICK_LOGINS.map((q) => (
            <button
              key={q.email}
              type="button"
              onClick={() => attempt(q.email, q.name)}
              style={{
                width: '100%', marginBottom: 8, padding: '8px 10px', fontSize: '0.85rem',
                textAlign: 'left', background: '#fff', border: '1px solid #c8c6c4',
                borderRadius: 4, cursor: 'pointer', color: '#242424',
              }}
            >
              {q.label}
              <span style={{ display: 'block', fontSize: '0.72rem', color: '#605e5c' }}>{q.email}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}