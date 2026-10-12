import { useEffect, useMemo, useState } from 'react'

export default function CommandPalette({ open, commands, onClose }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
    }
  }, [open])

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return commands
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(s) || (c.group || '').toLowerCase().includes(s)
    )
  }, [q, commands])

  useEffect(() => setIdx(0), [q])

  if (!open) return null

  const run = (c) => {
    onClose()
    c.run()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[idx]) run(items[idx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div className="modal palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="Type a command or merchant name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {items.length === 0 && <div className="palette-empty">No matches.</div>}
          {items.map((c, i) => (
            <div
              key={`${c.group}-${c.label}`}
              className={`palette-item ${i === idx ? 'active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c)}
            >
              <span className="palette-group">{c.group}</span>
              <span>{c.label}</span>
            </div>
          ))}
        </div>
        <div className="palette-foot">↑↓ navigate · Enter run · Esc close</div>
      </div>
    </div>
  )
}
