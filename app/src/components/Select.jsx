import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export default function Select({ options, value, onChange, placeholder = 'Select…', searchable = false, className = '', label = 'Select option', required = false, invalid = false }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const listId = useId()

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    if (!open) return
    const target = searchable ? ref.current.querySelector('input') : ref.current.querySelector('[aria-selected="true"], [role="option"]')
    target?.focus()
  }, [open, searchable])

  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const current = options.find((o) => o.value === value)
  const close = () => {
    setOpen(false)
    setQ('')
    ref.current?.querySelector('.select-btn')?.focus()
  }
  const keyDown = (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); return }
    const isOption = e.target.getAttribute('role') === 'option'
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) && !(isOption && ['Home', 'End'].includes(e.key))) return
    e.preventDefault()
    if (!open) { setOpen(true); return }
    const items = [...ref.current.querySelectorAll('[role="option"]')]
    const index = items.indexOf(document.activeElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : index < 0 ? items.length - 1 : Math.max(0, index - 1)
    items[next]?.focus()
  }

  return (
    <div className={`select ${className} ${open ? 'open' : ''}`} ref={ref} onKeyDown={keyDown}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <button type="button" className="select-btn" aria-label={`${label}: ${current?.label || placeholder}${required ? ' (required)' : ''}`}
        aria-invalid={invalid || undefined} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-expanded={open}
        onClick={() => { setQ(''); setOpen((o) => !o) }}>
        <span className={current ? '' : 'select-ph'}>{current ? (current.node || current.label) : placeholder}</span>
        <ChevronDown size={15} className="select-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="select-panel">
          {searchable && <div className="select-search">
            <Search size={14} aria-hidden="true" />
            <input value={q} aria-label={`Search ${label.toLowerCase()}`} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
          </div>}
          <div className="select-items" id={listId} role="listbox" aria-label={label}>
            {filtered.map((o) => (
              <button type="button" role="option" key={o.value} aria-selected={o.value === value}
                className={`select-item ${o.value === value ? 'active' : ''}`}
                onPointerDown={(e) => { e.preventDefault(); onChange(o.value); close() }}
                onClick={() => { onChange(o.value); close() }}>
                <span>{o.node || o.label}</span>{o.value === value && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
          {!filtered.length && <div className="select-empty" role="status">No matches.</div>}
        </div>
      )}
    </div>
  )
}
