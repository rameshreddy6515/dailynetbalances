import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import Switch from './Switch'
import { AccessibleDialog } from './ConfirmDialog'

const moveTo = (list, from, to) => {
  if (to < 0 || to >= list.length) return list
  const a = [...list]
  const [item] = a.splice(from, 1)
  a.splice(to, 0, item)
  return a
}

const Row = ({ label, shown, onToggle, onMove, canUp, canDown, onDragStart, onDrop, dragging }) => (
  <div
    className={`cfg-row ${dragging ? 'dragging' : ''}`}
    draggable
    onDragStart={onDragStart}
    onDragOver={(e) => e.preventDefault()}
    onDrop={onDrop}
  >
    <GripVertical size={14} className="grip" aria-hidden="true" />
    <Switch checked={shown} onChange={onToggle} ariaLabel={`Show ${label}`} />
    <span className="cfg-name">{label}</span>
    <button type="button" className="small secondary" data-tip="Move up" aria-label={`Move ${label} up`} disabled={!canUp} onClick={() => onMove(-1)}>
      <ChevronUp size={13} />
    </button>
    <button type="button" className="small secondary" data-tip="Move down" aria-label={`Move ${label} down`} disabled={!canDown} onClick={() => onMove(1)}>
      <ChevronDown size={13} />
    </button>
  </div>
)

export default function DashboardSettings({ open, cfg, statLabels, sectionLabels, onChange, onReset, onClose }) {
  const [drag, setDrag] = useState(null) // { orderKey, index }
  if (!open) return null

  const set = (patch) => onChange({ ...cfg, ...patch })
  const move = (list, i, dir) => moveTo(list, i, i + dir)
  const toggle = (hiddenKey, k) =>
    set({
      [hiddenKey]: cfg[hiddenKey].includes(k)
        ? cfg[hiddenKey].filter((x) => x !== k)
        : [...cfg[hiddenKey], k],
    })

  const group = (title, orderKey, hiddenKey, labels) => (
    <div key={title}>
      <div className="cfg-title">{title}</div>
      {cfg[orderKey].map((k, i) => (
        <Row
          key={k}
          label={labels[k] || k}
          shown={!cfg[hiddenKey].includes(k)}
          onToggle={() => toggle(hiddenKey, k)}
          onMove={(dir) => set({ [orderKey]: move(cfg[orderKey], i, dir) })}
          canUp={i > 0}
          canDown={i < cfg[orderKey].length - 1}
          dragging={drag?.orderKey === orderKey && drag?.index === i}
          onDragStart={() => setDrag({ orderKey, index: i })}
          onDrop={() => {
            if (drag?.orderKey === orderKey && drag.index !== i) {
              set({ [orderKey]: moveTo(cfg[orderKey], drag.index, i) })
            }
            setDrag(null)
          }}
        />
      ))}
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Drag rows to reorder
      </div>
    </div>
  )

  return (
    <AccessibleDialog title="Customize dashboard" onClose={onClose}>
        {group('Stat cards', 'statOrder', 'statHidden', statLabels)}
        {group('Sections', 'sectionOrder', 'sectionHidden', sectionLabels)}
        <div className="actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button type="button" className="secondary" onClick={onReset}>
            Reset to default
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
    </AccessibleDialog>
  )
}
