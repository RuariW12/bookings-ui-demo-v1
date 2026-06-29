// auth.jsx — swappable auth boundary.
import { createContext, useContext, useState } from 'react'
import { resolveUser, canApproveRegion } from './userConfig'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  const value = {
    user,
    isAuthenticated: !!user,
    signIn: (email, name) => {
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
    },
    signOut: () => setUser(null),
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