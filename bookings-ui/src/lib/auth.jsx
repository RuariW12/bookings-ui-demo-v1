// auth.jsx — swappable auth boundary.

import { createContext, useContext, useState } from 'react'
import { isApprover, approverRegions } from './approvers'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  const value = {
    user,
    isAuthenticated: !!user,
    // name is supplied by the caller for the demo logins; a real provider
    // would read it off the token.
    signIn: (email, name) =>
      setUser({
        email: email.toLowerCase(),
        name,
        isApprover: isApprover(email),
        approverRegions: approverRegions(email),
      }),
    signOut: () => setUser(null),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}