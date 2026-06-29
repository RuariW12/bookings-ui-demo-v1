// auth.jsx — swappable auth boundary.
import { createContext, useContext, useState } from 'react'
import { resolveUser, canApproveRegion } from './userConfig'
import { msalInstance, loginRequest } from './msalConfig'

const AuthContext = createContext(null)

let msalReady = false

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  function applyUser(email, name) {
    const resolved = resolveUser(email)
    if (!resolved) return false
    setUser({
      email: email.toLowerCase(),
      name,
      role: resolved.role,
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
    canApproveRegion: (region) =>
      user ? canApproveRegion(user.email, region) : false,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}