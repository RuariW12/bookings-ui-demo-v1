import { useState, useMemo, Fragment } from 'react'
import { SEED_BOOKINGS } from '../lib/bookings'
import { useAuth } from '../lib/auth'
import './approvals.css'

export default function Root() {
  const { user, isAuthenticated, signOut } = useAuth()
  const [tab, setTab] = useState("book")  // "book" | "schedule" | "approvals"

  // Gate: nothing renders until you've signed in.
  if (!isAuthenticated) return <Login />

  return (
    <div className={"page" + (tab === "schedule" || tab === "approvals" ? " page--wide" : "")}>
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
          {user.isApprover && (
            <span style={{
              marginLeft: 8, fontSize: "0.72rem", padding: "1px 6px", borderRadius: 4,
              background: "#fdecdf", color: "#c2410c",
            }}>approver</span>
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
        </div>

        {tab === "book" && <App />}
        {tab === "approvals" && <Approvals />}
      </main>

      {tab === "schedule" && <Schedule />}

      <footer className="site-footer">
        <p className="footer-policy"></p>
        <hr />
      </footer>
    </div>
  )
}