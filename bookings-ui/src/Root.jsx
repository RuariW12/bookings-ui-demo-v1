import { useState, useEffect } from 'react'
import App from './pages/App'          // booking form (just the fields)
import Schedule from './pages/Schedule'
import Approvals from './pages/approvals'
import Login from './pages/Login'
import Admin from './pages/Admin'
import strategyLogo from './assets/strategy.jpg'
import { useAuth } from './lib/auth'
import './pages/App.css'

export default function Root() {
  const { user, isAuthenticated, signOut } = useAuth()
  const [tab, setTab] = useState("book")  // "book" | "schedule" | "approvals" | "admin"

  useEffect(() => {
    if (!user) return
    if (user.isAdmin) setTab("admin")
    else if (user.isApprover) setTab("approvals")
    else setTab("book")
  }, [user])

  // Gate: nothing renders until you've signed in.
  if (!isAuthenticated) return <Login />

  const roleBadge = user.isAdmin ? "admin" : user.isApprover ? "approver" : null

  return (
    <div className={"page" + (tab === "schedule" || tab === "approvals" || tab === "admin" ? " page--wide" : "")}>
      <header className="brand-header">
        <img src={strategyLogo} className="logo-img" alt="Strategy" />
        <h1 className="brand-title">Strategy</h1>
      </header>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
        padding: "8px 16px", fontSize: "0.85rem", color: "#242424",
        borderBottom: "1px solid #e1dfdd", background: "#faf9f8",
      }}>
        <span>
          {user.name}
          {roleBadge && (
            <span style={{
              marginLeft: 8, fontSize: "0.72rem", padding: "1px 6px", borderRadius: 4,
              background: "#fdecdf", color: "#c2410c",
            }}>{roleBadge}</span>
          )}
        </span>
        <button
          onClick={signOut}
          style={{
            fontSize: "0.78rem", padding: "3px 8px", border: "1px solid #c8c6c4",
            borderRadius: 4, background: "#fff", cursor: "pointer", color: "#605e5c",
          }}
        >
          Sign out
        </button>
      </div>
      <main className="content">
        <div className="service-card service-tabs">
          <button
            className={"service-tab" + (tab === "book" ? " active" : "")}
            onClick={() => setTab("book")}
          >
            Book
          </button>
          <button
            className={"service-tab" + (tab === "schedule" ? " active" : "")}
            onClick={() => setTab("schedule")}
          >
            Schedule
          </button>
          <button
            className={"service-tab" + (tab === "approvals" ? " active" : "")}
            onClick={() => setTab("approvals")}
          >
            Approvals
          </button>
          {user.isAdmin && (
            <button
              className={"service-tab" + (tab === "admin" ? " active" : "")}
              onClick={() => setTab("admin")}
            >
              Admin
            </button>
          )}
        </div>
        {tab === "book" && <App />}
        {tab === "approvals" && <Approvals />}
        {tab === "admin" && user.isAdmin && <Admin />}
      </main>
      {tab === "schedule" && <Schedule />}
      <footer className="site-footer">
        <p className="footer-policy"></p>
        <hr />
      </footer>
    </div>
  )
}