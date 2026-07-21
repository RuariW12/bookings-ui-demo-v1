import { useState } from 'react'
import { useAuth } from '../lib/auth'
import strategyLogo from '../assets/strategy.jpg'

const INK = '#242424'
const MUTED = '#605e5c'
const BORDER = '#d7d5d2'
const ACCENT = '#e35205'
const SURFACE = '#f3f2f1'

export default function Login() {
  const { msalSignIn } = useAuth()
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

          {error && (
            <p style={{ margin: '14px 0 0', fontSize: '0.82rem', color: '#c0392b' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}