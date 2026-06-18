import { useState } from 'react'
import App from './App'          // your existing booking form (unchanged)
import Schedule from './Schedule'

export default function Root() {
  const [tab, setTab] = useState("book")  // "book" | "schedule"
  return (
    <div className="page">
      <nav className="app-tabs">
        <button className={"app-tab" + (tab === "book" ? " active" : "")} onClick={() => setTab("book")}>
          Book
        </button>
        <button className={"app-tab" + (tab === "schedule" ? " active" : "")} onClick={() => setTab("schedule")}>
          Schedule
        </button>
      </nav>
      {tab === "book" ? <App /> : <Schedule />}
    </div>
  )
}
