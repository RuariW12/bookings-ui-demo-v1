// auth.jsx — swappable auth boundary. Role source is Postgres via userStore.fetchMe.
import { createContext, useContext, useState, useEffect } from 'react'
import { fetchMe } from './userStore'
import { msalInstance, loginRequest } from './msalConfig'

const AuthContext = createContext(null)

// Single shared redirect-handling promise so React StrictMode's double-mount
// doesn't call handleRedirectPromise twice. MSAL is already initialized in main.jsx.
let redirectPromise
function getRedirect() {
  if (!redirectPromise) redirectPromise = msalInstance.handleRedirectPromise()
  return redirectPromise
}

function clearAuthHash() {
  if (window.location.hash.includes('code=') || window.location.hash.includes('error=')) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const [authError, setAuthError] = useState('')

  async function applyUser(email, name) {
    const resolved = await fetchMe(email)   // null => not authorized
    if (!resolved) return false
    setUser({
      email: resolved.email,
      name: resolved.displayName || name || resolved.email.split('@')[0],
      role: resolved.role,
      isAdmin: resolved.role === 'admin',
      isApprover: resolved.role === 'approver',
      approverRegions: resolved.regions,
    })
    return true
  }

  // Complete any redirect sign-in when the app loads back from Microsoft.
  useEffect(() => {
    ;(async () => {
      try {
        const result = await getRedirect()
        if (result?.account) {
          const ok = await applyUser(result.account.username, result.account.name)
          if (!ok) {
            setAuthError('That account isn’t authorized for bookings. Contact your Cloud Support admin.')
          }
        }
      } catch (e) {
        console.warn('MSAL redirect handling skipped:', e.errorCode || e.message)
        clearAuthHash()
      } finally {
        setInitializing(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = {
    user,
    isAuthenticated: !!user,
    initializing,
    authError,
    signIn: applyUser,
    msalSignIn: async () => {
      setAuthError('')
      await msalInstance.loginRedirect(loginRequest) // navigates away; no return value
    },
    signOut: () => {
      setUser(null)
      msalInstance.logoutRedirect().catch(() => {})
    },
    canApproveRegion: (region) => {
      if (!user) return false
      if (user.role !== 'approver' && user.role !== 'admin') return false
      const regions = user.approverRegions || []
      return regions.includes('*') || regions.includes(region)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}