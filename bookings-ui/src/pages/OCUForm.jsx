import { useState } from 'react'
import { useAuth } from '../lib/auth'

// OCU booking form. Fields are manual entry for now; the CID / environment
// inputs are the seam where ServiceNow autofill slots in later (same pattern
// as the migration form), at which point environment ID becomes a SNOW-backed
// dropdown instead of a text field.
export default function OCUForm() {
  const { user } = useAuth()

  const [cid, setCid] = useState('')
  const [environmentType, setEnvironmentType] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [csmEmail, setCsmEmail] = useState(user?.email || '')
  const [detailsText, setDetailsText] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState('')

  const canBook = cid && environmentId && date && time

  async function handleBook() {
    setError('')
    const body = {
      process_type: 'ocu',
      scheduled_date: date,
      scheduled_time: time,
      // Top-level fields so existing Schedule/Approvals views can render OCU rows.
      company_id: cid || null,
      environment_id: environmentId || null,
      environment_name: environmentType || null,
      requester_email: csmEmail || null,
      requester_name: user?.displayName || null,
      notes: detailsText || null,
      // OCU-specific payload in the JSONB details column.
      details: {
        cid: cid || null,
        environment_type: environmentType || null,
        environment_id: environmentId || null,
        csm_email: csmEmail || null,
        details_text: detailsText || null,
        // All manual for now; SNOW autofill will set these to 'servicenow'.
        field_source: {
          cid: 'manual',
          environment_type: 'manual',
          environment_id: 'manual',
        },
      },
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let detail = `Server responded with status ${res.status}`
        try { detail = (await res.json()).detail || detail } catch {}
        throw new Error(detail)
      }
      alert('OCU booking saved!')
      setCid(''); setEnvironmentType(''); setEnvironmentId('')
      setDetailsText(''); setDate(''); setTime('')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <div className="field">
        <label>CID</label>
        <input type="text" value={cid} onChange={(e) => setCid(e.target.value)}
          placeholder="Customer ID" />
      </div>

      <div className="field">
        <label>Environment type</label>
        <select value={environmentType} onChange={(e) => setEnvironmentType(e.target.value)}>
          <option value="">-- select --</option>
          <option value="DEV">DEV</option>
          <option value="PROD">PROD</option>
        </select>
      </div>

      <div className="field">
        <label>Environment ID</label>
        <input type="text" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}
          placeholder="Environment identifier" />
      </div>

      <div className="field">
        <label>CSM email</label>
        <input type="text" value={csmEmail} onChange={(e) => setCsmEmail(e.target.value)}
          placeholder="csm@strategy.com" />
      </div>

      <div className="field">
        <label>Select a date and time</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="tz">All times are in (UTC−05:00) Eastern Time (US &amp; Canada)</div>
      </div>

      <div className="field">
        <label>Details (optional)</label>
        <textarea value={detailsText} onChange={(e) => setDetailsText(e.target.value)}
          placeholder="Any additional details for this OCU request" />
      </div>

      {error && <p style={{ color: '#c2410c', fontSize: '0.85rem' }}>{error}</p>}

      <div className="book-row">
        <button type="button" className="book-btn" onClick={handleBook} disabled={!canBook}>Book</button>
      </div>
    </>
  )
}