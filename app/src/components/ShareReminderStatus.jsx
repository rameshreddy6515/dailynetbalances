import { useEffect, useState } from 'react'

export default function ShareReminderStatus({ schedule, onPhone, onShare }) {
  const [editing, setEditing] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!schedule.enabled) return
    const timer = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(timer)
  }, [schedule.enabled])
  const times = schedule.times.filter((t) => /^\d\d:\d\d$/.test(t)).slice().sort()
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const today = times.find((t) => t > clock)
  const next = today || times[0]
  const [h, m] = (next || '').split(':')
  return (
    <div className="share-reminder-status">
      <strong>{!schedule.enabled ? 'Sharing reminders off' : next
        ? `Next reminder: ${today ? 'Today' : 'Tomorrow'}, ${Number(h) % 12 || 12}:${m} ${Number(h) < 12 ? 'AM' : 'PM'}`
        : 'Choose a reminder time'}</strong>
      <div className="actions">
        <span>{schedule.phone ? `Recipient: •••• ${schedule.phone.slice(-4)}` : 'Recipient: choose in WhatsApp'}</span>
        <button type="button" className="secondary small" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit recipient'}</button>
        <button type="button" className="secondary small" onClick={onShare}>Open WhatsApp</button>
      </div>
      {editing && <label>Recipient number with country code (optional)
        <input type="tel" autoComplete="tel" value={schedule.phone} onChange={(e) => onPhone(e.target.value)} />
      </label>}
      <p className="sheet-hint">The app reminds you while it’s open. You press Send in WhatsApp.</p>
    </div>
  )
}
