// auth.jsx — swappable auth boundary. Role source is Postgres via userStore.fetchMe.
import { createContext, useContext, useState } from 'react'
import { fetchMe } from './userStore'
import { msalInstance, loginRequest } from './msalConfig'

const AuthContext = createContext(null)

let msalReady = false

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

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

  const value = {
    user,
    isAuthenticated: !!user,
    signIn: applyUser,
    msalSignIn: async () => {
      if (!msalReady) {
        await msalInstance.initialize()
        msalReady = true
      }
      const result = await msalInstance.loginPopup(loginRequest)
      const email = result.account.username
      const name = result.account.name || email.split('@')[0]
      return applyUser(email, name)
    },
    signOut: () => {
      setUser(null)
      msalInstance.logoutPopup().catch(() => {})
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