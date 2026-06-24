import { useState } from 'react'
import App from './pages/App'          // booking form (just the fields)
import Schedule from './pages/Schedule'
import Approvals from './pages/approvals'
import strategyLogo from './assets/strategy.jpg'
import './pages/App.css'

export default function Root() {
  const [tab, setTab] = useState("book")  // "book" | "schedule" | "approvals"

  return (
    <div className={"page" + (tab === "schedule" || tab === "approvals" ? " page--wide" : "")}>
      <header className="brand-header">
        <img src={strategyLogo} className="logo-img" alt="Strategy" />
        <h1 className="brand-title">Strategy</h1>
      </header>

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