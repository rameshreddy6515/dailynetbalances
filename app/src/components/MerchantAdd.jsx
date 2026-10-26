import { useState } from 'react'
import { Check, ImagePlus, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import MerchantAvatar from './MerchantAvatar'

export default function MerchantAdd({ merchants, balances = {}, logoUrls = {}, onAdd, onRename, onDelete, onSetStart, onUploadLogo, onRemoveLogo }) {
  const [name, setName] = useState('')
  const [startBal, setStartBal] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [startValues, setStartValues] = useState({})
  const [uploadingLogo, setUploadingLogo] = useState(null)

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

  const uploadLogo = async (merchant, file) => {
    setUploadingLogo(merchant)
    try {
      await onUploadLogo(merchant, file)
    } finally {
      setUploadingLogo(null)
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
                    <div className="merchant-row-head">
                      <span className="m-name"><MerchantAvatar name={m} logoUrl={logoUrls[m]} />{m}</span>
                      <div className="merchant-logo-actions">
                        <label
                          className={`small secondary merchant-logo-upload${uploadingLogo === m ? ' is-uploading' : ''}`}
                          aria-live="polite"
                        >
                          {uploadingLogo === m
                            ? <><LoaderCircle size={15} className="merchant-logo-spinner" /> Uploading…</>
                            : <><ImagePlus size={13} /><span className="merchant-logo-label">{logoUrls[m] ? 'Change logo' : 'Add logo'}</span></>}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label={`${logoUrls[m] ? 'Change' : 'Add'} logo for ${m}`}
                            disabled={uploadingLogo === m}
                            title={`${logoUrls[m] ? 'Change' : 'Add'} logo for ${m}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) uploadLogo(m, file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        {logoUrls[m] && (
                          <button
                            type="button"
                            className="small secondary merchant-logo-remove"
                            aria-label={`Remove logo for ${m}`}
                            title="Remove logo"
                            disabled={uploadingLogo === m}
                            onClick={() => onRemoveLogo(m)}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="merchant-row-controls">
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
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
    </div>
  )
}
