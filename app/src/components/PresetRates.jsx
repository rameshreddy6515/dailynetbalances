import { useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'

export default function PresetRates({ rates, onChange, onConfirm, notify }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null)
  const [eVal, setEVal] = useState('')

  const validate = (p, skip = -1) => {
    const v = parseFloat(p)
    if (!(v > 0)) return 'Enter a rate above 0'
    if (rates.some((r, i) => i !== skip && r === v)) return 'That rate already exists'
    return ''
  }

  const submit = () => {
    const e = validate(val)
    if (e) return setErr(e)
    onChange([...rates, parseFloat(val)].sort((a, b) => a - b))
    setVal('')
    setErr('')
    notify?.('Preset rate added', 'success')
  }

  const submitEdit = () => {
    const e = validate(eVal, editing)
    if (e) return setErr(e)
    onChange(rates.map((r, i) => (i === editing ? parseFloat(eVal) : r)).sort((a, b) => a - b))
    setEditing(null)
    setErr('')
    notify?.('Preset rate updated', 'success')
  }

  const remove = async (i) => {
    const ok = await onConfirm(`Remove the ${rates[i]}% preset?`, { confirmLabel: 'Delete', danger: true })
    if (!ok) return
    onChange(rates.filter((_, x) => x !== i))
    notify?.('Preset rate removed', 'success')
  }

  return (
    <div className="merchant-manager">
      <div className="merchant-add">
        <label>
          Rate %
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 2.5"
            value={val}
            onChange={(e) => { setVal(e.target.value); setErr('') }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </label>
        <button type="button" className="primary" onClick={submit}>
          <Plus size={15} /> Add Rate
        </button>
      </div>
      {err && <div className="message error">{err}</div>}

      <div className="merchant-list">
        {rates.length === 0 && <div className="muted">No preset rates — the calculator will only have the custom field.</div>}
        {rates.map((r, i) => (
          <div key={r} className="merchant-row">
            {editing === i ? (
              <>
                <input
                  type="number"
                  className="rename-input type-pct-input"
                  step="0.01"
                  min="0"
                  value={eVal}
                  onChange={(e) => { setEVal(e.target.value); setErr('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitEdit()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  autoFocus
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
                <span className="m-name">{r}%</span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="small secondary"
                    onClick={() => {
                      setEditing(i)
                      setEVal(String(r))
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
