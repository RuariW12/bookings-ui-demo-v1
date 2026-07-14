import { useState } from 'react'
import { useAuth } from '../lib/auth'
import strategyLogo from '../assets/strategy.jpg'

const QUICK_LOGINS = [
  { email: 'requester@strategy.com', name: 'Requester', label: 'Sign in as a requester' },
  { email: 'rwhalen@strategy.com', name: 'Ruari Whalen', label: 'Sign in as an approver' },
]

const INK = '#242424'
const MUTED = '#605e5c'
const BORDER = '#d7d5d2'
const HAIRLINE = '#e6e4e2'
const ACCENT = '#e35205'
const SURFACE = '#f3f2f1'

export default function Login() {
  const { signIn, msalSignIn } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleMsal() {
    setError('')
    setLoading(true)
    try {
      const recognized = await msalSignIn()
      if (!recognized) setError('Your account is not authorized for this app.')
    } catch (e) {
      if (e.errorCode === 'user_cancelled') return
      setError('Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

async function handleDemo(q) {
    setError('')
    try {
      const ok = await signIn(q.email, q.name)
      if (!ok) setError('Demo account is not a registered user.')
    } catch {
      setError('Sign-in failed. Please try again.')
    }
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

          <button
            type="button"
            onClick={handleMsal}
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', fontSize: '0.9rem', fontWeight: 600,
              color: '#fff', background: loading ? '#999' : ACCENT,
              border: 'none', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in with Microsoft'}
          </button>

          {error && <p style={{ color: '#c2410c', fontSize: '0.75rem', margin: '8px 0 0' }}>{error}</p>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <span style={{ flex: 1, height: 1, background: HAIRLINE }} />
            <span style={{ fontSize: '0.72rem', color: MUTED }}>demo logins</span>
            <span style={{ flex: 1, height: 1, background: HAIRLINE }} />
          </div>

          {QUICK_LOGINS.map((q) => (
            <button
              key={q.email}
              type="button"
              onClick={() => handleDemo(q)}
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
      </div>
    </div>
  )
}