import { useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'

export default function ChargeTypes({ types, onChange, onConfirm, notify }) {
  const [name, setName] = useState('')
  const [pct, setPct] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null)
  const [eName, setEName] = useState('')
  const [ePct, setEPct] = useState('')

  const validate = (n, p, skip = -1) => {
    const t = n.trim()
    if (!t) return 'Enter a type name'
    if (!(parseFloat(p) > 0)) return 'Enter a rate above 0'
    if (types.some((x, i) => i !== skip && x[0].toLowerCase() === t.toLowerCase())) return 'That name already exists'
    return ''
  }

  const submit = () => {
    const e = validate(name, pct)
    if (e) return setErr(e)
    onChange([...types, [name.trim(), parseFloat(pct)]])
    setName('')
    setPct('')
    setErr('')
    notify?.('Merchant type added', 'success')
  }

  const submitEdit = () => {
    const e = validate(eName, ePct, editing)
    if (e) return setErr(e)
    onChange(types.map((t, i) => (i === editing ? [eName.trim(), parseFloat(ePct)] : t)))
    setEditing(null)
    setErr('')
    notify?.('Merchant type updated', 'success')
  }

  const remove = async (i) => {
    const ok = await onConfirm(`Delete merchant type "${types[i][0]}"?`, { confirmLabel: 'Delete', danger: true })
    if (!ok) return
    onChange(types.filter((_, x) => x !== i))
    notify?.('Merchant type deleted', 'success')
  }

  return (
    <div className="merchant-manager">
      <div className="merchant-add">
        <label>
          Type name
          <input
            type="text"
            placeholder="e.g. SLPE Gold"
            value={name}
            onChange={(e) => { setName(e.target.value); setErr('') }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </label>
        <label>
          Rate %
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 1.56"
            value={pct}
            onChange={(e) => { setPct(e.target.value); setErr('') }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </label>
        <button type="button" className="primary" onClick={submit}>
          <Plus size={15} /> Add Type
        </button>
      </div>
      {err && <div className="message error">{err}</div>}

      <div className="merchant-list">
        {types.length === 0 && <div className="muted">No merchant types — the calculator dropdown will be empty.</div>}
        {types.map(([n, p], i) => (
          <div key={n} className="merchant-row">
            {editing === i ? (
              <>
                <input
                  type="text"
                  className="rename-input"
                  value={eName}
                  onChange={(e) => { setEName(e.target.value); setErr('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitEdit()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  autoFocus
                />
                <input
                  type="number"
                  className="rename-input type-pct-input"
                  step="0.01"
                  min="0"
                  value={ePct}
                  onChange={(e) => { setEPct(e.target.value); setErr('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitEdit()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
                <div className="row-actions">
                  <button type="button" className="small primary" onClick={submitEdit}>
                    <Check size={13} /> Save
                  </button>
                  <button type="button" className="small secondary" onClick={() => { setEditing(null); setErr('') }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="m-name">{n}</span>
                <span className="type-pct">{p}%</span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="small secondary"
                    onClick={() => {
                      setEditing(i)
                      setEName(n)
                      setEPct(String(p))
                      setErr('')
                    }}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button type="button" className="small danger" onClick={() => remove(i)}>
                    <Trash2 size={13} /> Delete
                  </button>
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
