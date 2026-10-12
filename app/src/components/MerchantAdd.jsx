import { useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import MerchantAvatar from './MerchantAvatar'

export default function MerchantAdd({ merchants, balances = {}, onAdd, onRename, onDelete, onSetStart }) {
  const [name, setName] = useState('')
  const [startBal, setStartBal] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [startValues, setStartValues] = useState({})

  const submit = async () => {
    if (await onAdd(name, startBal)) {
      setName('')
      setStartBal('')
    }
  }

  const startValue = (m) => startValues[m] ?? (balances[m] !== undefined ? String(balances[m]) : '0')

  const saveStart = async (m) => {
    if (await onSetStart(m, startValue(m))) {
      setStartValues((s) => {
        const c = { ...s }
        delete c[m]
        return c
      })
    }
  }

  const submitRename = async (m) => {
    if (await onRename(m, renameValue)) {
      setRenaming(null)
      setRenameValue('')
    }
  }

  return (
    <div className="merchant-manager">
      <div className="merchant-add">
            <label>
              Add new merchant
              <input
                type="text"
                list="merchantSuggestions"
                placeholder="e.g. ABC Store"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
            </label>
            <label>
              Starting balance
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={startBal}
                onChange={(e) => setStartBal(e.target.value)}
              />
            </label>
            <button type="button" className="primary" onClick={submit}>
              <Plus size={15} /> Add Merchant
            </button>
            <datalist id="merchantSuggestions">
              {merchants.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="merchant-list">
            {merchants.length === 0 && <div className="muted">No merchants yet — add one above.</div>}
            {merchants.map((m) => (
              <div key={m} className="merchant-row">
                {renaming === m ? (
                  <>
                    <input
                      type="text"
                      className="rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(m)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      autoFocus
                    />
                    <div className="row-actions">
                      <button type="button" className="small primary" onClick={() => submitRename(m)}>
                        <Check size={13} /> Save
                      </button>
                      <button type="button" className="small secondary" onClick={() => setRenaming(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="m-name"><MerchantAvatar name={m} />{m}</span>
                    <span className="m-start">
                      Start
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={startValue(m)}
                        onChange={(e) => setStartValues((s) => ({ ...s, [m]: e.target.value }))}
                      />
                      <button type="button" className="small secondary" onClick={() => saveStart(m)}>
                        <Check size={13} /> Save
                      </button>
                    </span>
                    <span className="row-actions">
                      <button
                        type="button"
                        className="small secondary"
                        onClick={() => {
                          setRenaming(m)
                          setRenameValue(m)
                        }}
                      >
                        <Pencil size={13} /> Rename
                      </button>
                      <button type="button" className="small danger" onClick={() => onDelete(m)}>
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
