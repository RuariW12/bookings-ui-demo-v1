import { useState } from 'react'
import { useAuth } from '../lib/auth'
import strategyLogo from '../assets/strategy.jpg'

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

// palette
const INK = '#242424'
const MUTED = '#605e5c'
const BORDER = '#d7d5d2'
const HAIRLINE = '#e6e4e2'
const ACCENT = '#1b3a5b'      // deep slate-blue: primary action
const SURFACE = '#f3f2f1'

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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: SURFACE, padding: 16, boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{
          background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: 28, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <img
            src={strategyLogo}
            alt="Strategy"
            style={{ display: 'block', width: 150, height: 'auto', margin: '0 auto 20px' }}
          />
          <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 600, color: INK }}>
            Sign in to continue
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: MUTED }}>
            Booking and approvals are limited to Strategy staff.
          </p>

          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 5, color: INK }}>
            Work email
          </label>
          <input
            type="email"
            value={email}
            placeholder="you@strategy.com"
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && attempt(email)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: '0.9rem',
              border: `1px solid ${error ? '#c2410c' : BORDER}`, borderRadius: 6, color: INK, outline: 'none',
            }}
          />
          {error && <p style={{ color: '#c2410c', fontSize: '0.75rem', margin: '6px 0 0' }}>{error}</p>}

          <button
            type="button"
            onClick={() => attempt(email)}
            style={{
              width: '100%', marginTop: 16, padding: '10px 0', fontSize: '0.9rem', fontWeight: 600,
              color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Continue
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <span style={{ flex: 1, height: 1, background: HAIRLINE }} />
            <span style={{ fontSize: '0.72rem', color: MUTED }}>or try the demo</span>
            <span style={{ flex: 1, height: 1, background: HAIRLINE }} />
          </div>

          {QUICK_LOGINS.map((q) => (
            <button
              key={q.email}
              type="button"
              onClick={() => attempt(q.email, q.name)}
              onMouseEnter={(e) => (e.currentTarget.style.background = SURFACE)}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              style={{
                width: '100%', marginBottom: 8, padding: '9px 11px', fontSize: '0.85rem',
                textAlign: 'left', background: '#fff', border: `1px solid ${BORDER}`,
                borderRadius: 6, cursor: 'pointer', color: INK,
              }}
            >
              {q.label}
              <span style={{ display: 'block', fontSize: '0.72rem', color: MUTED, marginTop: 1 }}>{q.email}</span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: '0.72rem', color: MUTED, lineHeight: 1.5, margin: '14px 4px 0' }}>
          Demo: this checks the email domain. The real version swaps this screen for
          Microsoft sign-in behind the same boundary — the rest of the app is unchanged.
        </p>
      </div>
    </div>
  )
}