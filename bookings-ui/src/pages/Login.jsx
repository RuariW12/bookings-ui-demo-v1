import { useState } from 'react'
import { useAuth } from '../lib/auth'
import strategyLogo from '../assets/strategy.jpg'

const INK = '#242424'
const MUTED = '#605e5c'
const HAIRLINE = '#e6e4e2'
const ACCENT = '#e35205'
const ACCENT_DK = '#cf4a04'
const SURFACE = '#f3f2f1'

// Microsoft four-square glyph, rendered white to sit on the accent button.
function MsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
      style={{ display: 'block' }}>
      <rect x="0" y="0" width="7" height="7" fill="#fff" />
      <rect x="9" y="0" width="7" height="7" fill="#fff" opacity="0.85" />
      <rect x="0" y="9" width="7" height="7" fill="#fff" opacity="0.85" />
      <rect x="9" y="9" width="7" height="7" fill="#fff" opacity="0.7" />
    </svg>
  )
}

export default function Login() {
  const { msalSignIn } = useAuth()
  const [msg, setMsg] = useState(null) // { tone: 'error' | 'info', text }
  const [loading, setLoading] = useState(false)

  async function handleMsal() {
    setMsg(null)
    setLoading(true)
    try {
      const recognized = await msalSignIn()
      if (!recognized) {
        setMsg({
          tone: 'info',
          text: 'That account isn’t authorized for bookings. Contact your Cloud Support admin.',
        })
      }
    } catch (e) {
      if (e.errorCode === 'user_cancelled') return
      setMsg({ tone: 'error', text: 'Sign-in didn’t complete. Try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: SURFACE, padding: 16, boxSizing: 'border-box',
    }}>
      <style>{`
        @keyframes sg-spin { to { transform: rotate(360deg); } }
        .sg-msbtn {
          width: 100%; display: flex; align-items: center; justify-content: center;
          gap: 10px; padding: 11px 0; font-size: 0.9rem; font-weight: 600;
          color: #fff; background: ${ACCENT}; border: none; border-radius: 8;
          cursor: pointer; transition: background .15s ease, box-shadow .15s ease;
        }
        .sg-msbtn:hover:not(:disabled) { background: ${ACCENT_DK}; }
        .sg-msbtn:focus-visible {
          outline: none; box-shadow: 0 0 0 3px rgba(227,82,5,0.35);
        }
        .sg-msbtn:disabled { background: #b9b7b4; cursor: default; }
        .sg-spinner {
          width: 15px; height: 15px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.45); border-top-color: #fff;
          animation: sg-spin .7s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) { .sg-spinner { animation: none; } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{
          background: '#fff', borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${HAIRLINE}`,
          boxShadow: '0 6px 24px rgba(36,36,36,0.08), 0 1px 2px rgba(36,36,36,0.06)',
        }}>
          {/* Signature: brand accent rule */}
          <div style={{ height: 3, background: ACCENT }} />

          <div style={{ padding: '30px 28px 26px' }}>
            <img
              src={strategyLogo}
              alt="Strategy"
              style={{ display: 'block', width: 148, height: 'auto', margin: '2px auto 22px' }}
            />

            <h1 style={{
              margin: '0 0 5px', fontSize: '1.15rem', fontWeight: 600,
              color: INK, textAlign: 'center', letterSpacing: '-0.01em',
            }}>
              Sign in to continue
            </h1>
            <p style={{
              margin: '0 0 22px', fontSize: '0.85rem', lineHeight: 1.45,
              color: MUTED, textAlign: 'center',
            }}>
              Booking and approvals are limited to Strategy staff.
            </p>

            <button
              type="button"
              className="sg-msbtn"
              onClick={handleMsal}
              disabled={loading}
              aria-busy={loading}
            >
              {loading
                ? (<><span className="sg-spinner" /> Signing in…</>)
                : (<><MsGlyph /> Sign in with Microsoft</>)}
            </button>

            {msg && (
              <p role={msg.tone === 'error' ? 'alert' : 'status'} style={{
                margin: '14px 0 0', fontSize: '0.82rem', lineHeight: 1.4,
                textAlign: 'center',
                color: msg.tone === 'error' ? '#c0392b' : '#8a5a00',
              }}>
                {msg.text}
              </p>
            )}
          </div>

          <div style={{
            borderTop: `1px solid ${HAIRLINE}`, padding: '11px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#7a7a7a',
            }} />
            <span style={{ fontSize: '0.74rem', color: MUTED }}>
              Secured with Microsoft Entra ID
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}