import { useState } from 'react'
import App from './App'          // booking form 
import Schedule from './Schedule'
import Approvals from './Approvals'
import strategyLogo from './assets/strategy.jpg'
import './App.css'

export default function Root() {
  const [tab, setTab] = useState("book")  // "book" | "schedule" | "approvals"

  return (
    <div className="page">
      <header className="brand-header">
        <img src={strategyLogo} className="logo-img" alt="Strategy" />
        <h1 className="brand-title">Strategy</h1>
      </header>

      <main className="content">
        {/* Orange bar is the page switcher */}
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