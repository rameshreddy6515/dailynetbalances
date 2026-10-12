import { useEffect, useId, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { localToday } from '../format'

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function DatePicker({ value, onChange, placeholder = 'Pick a date', label = 'Date', required = false, invalid = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const panelId = useId()
  const focusDate = useRef(null)
  const sel = value ? new Date(`${value}T00:00:00`) : null
  const [view, setView] = useState(sel || new Date())

  useEffect(() => {
    if (open) setView(sel || new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (focusDate.current) {
      ref.current?.querySelector(`[data-date="${focusDate.current}"]`)?.focus()
      focusDate.current = null
    }
  }, [view])

  const choose = (date) => {
    onChange(date)
    setOpen(false)
    ref.current?.querySelector('.select-btn')?.focus()
  }
  const navigateDay = (e, day) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!(e.key in offsets) && !['Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const date = new Date(view.getFullYear(), view.getMonth(), day)
    const offset = e.key === 'Home' ? -date.getDay() : e.key === 'End' ? 6 - date.getDay() : offsets[e.key]
    date.setDate(date.getDate() + offset)
    focusDate.current = iso(date.getFullYear(), date.getMonth(), date.getDate())
    setView(date)
  }

  const y = view.getFullYear()
  const m = view.getMonth()
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const todayStr = localToday()
  const display = sel ? `${pad(sel.getDate())}-${pad(sel.getMonth() + 1)}-${sel.getFullYear()}` : null

  return (
    <div className="datepicker" ref={ref} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }} onKeyDown={(e) => {
      if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); ref.current?.querySelector('button')?.focus() }
    }}>
      <button type="button" className="select-btn" aria-label={`${label}: ${display || placeholder}${required ? ' (required)' : ''}`} aria-invalid={invalid || undefined} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((o) => !o)}>
        <span className={display ? '' : 'select-ph'}>{display || placeholder}</span>
        <Calendar size={15} />
      </button>
      {open && (
        <div className="dp-panel" id={panelId} role="group" aria-label={`Choose ${label.toLowerCase()}`}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onPointerDown={(e) => { e.preventDefault(); setView(new Date(y, m - 1, 1)) }} onClick={() => setView(new Date(y, m - 1, 1))}>
              <ChevronLeft size={15} />
            </button>
            <span className="dp-title" aria-live="polite">
              {MONTHS[m]} {y}
            </span>
            <button type="button" className="dp-nav" aria-label="Next month" onPointerDown={(e) => { e.preventDefault(); setView(new Date(y, m + 1, 1)) }} onClick={() => setView(new Date(y, m + 1, 1))}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="dp-grid">
            {DOW.map((d, i) => (
              <span key={i} className="dp-dow">
                {d}
              </span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  className={`dp-day ${value === iso(y, m, d) ? 'active' : ''} ${
                    iso(y, m, d) === todayStr ? 'today' : ''
                  }`}
                  data-date={iso(y, m, d)}
                  aria-label={`${d} ${MONTHS[m]} ${y}`}
                  aria-pressed={value === iso(y, m, d)}
                  aria-current={iso(y, m, d) === todayStr ? 'date' : undefined}
                  onKeyDown={(e) => navigateDay(e, d)}
                  onPointerDown={(e) => { e.preventDefault(); choose(iso(y, m, d)) }}
                  onClick={() => choose(iso(y, m, d))}
                >
                  {d}
                </button>
              ) : (
                <span key={i} />
              )
            )}
          </div>
          <button
            type="button"
            className="dp-today"
            onPointerDown={(e) => { e.preventDefault(); choose(todayStr) }}
            onClick={() => choose(todayStr)}
          >
            Today
          </button>
          {!required && value && <button type="button" className="dp-today" onPointerDown={(e) => { e.preventDefault(); choose('') }} onClick={() => choose('')}>Clear date</button>}
        </div>
      )}
    </div>
  )
}
