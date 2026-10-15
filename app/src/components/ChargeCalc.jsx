import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import Select from './Select'
import { fmt, toNumber } from '../format'

import { DEFAULT_PCTS, DEFAULT_TYPES } from '../chargeData'

export default function ChargeCalc({ currency, types = DEFAULT_TYPES, presets = DEFAULT_PCTS }) {
  const [amount, setAmount] = useState('')
  const [typeName, setTypeName] = useState(() => localStorage.getItem('chargeTypeLast') || '')
  const [sel, setSel] = useState('')
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    if (!reveal) return
    const t = setTimeout(() => setReveal(false), 3000)
    return () => clearTimeout(t)
  }, [reveal])
  const amt = toNumber(amount)
  const rate = toNumber(sel)
  const charges = (amt * rate) / 100
  const pct = String(types.find(([n]) => n === typeName)?.[1] ?? '')
  const pctAmt = (amt * toNumber(pct)) / 100
  const ccAmt = amt - charges
  const finalAmt = charges - pctAmt

  return (
    <div className="charge-grid">
      <label>
        Amount
        <input type="number" step="0.01" min="0" placeholder="0.00" value={amount}
          onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <label>
        <span>
          Merchant Type
          {toNumber(pct) > 0 && (
            <span className="charge-info" data-tip={`${pct}%`} tabIndex={0} role="img" aria-label={`Rate ${pct}%`}>
              <Info size={13} />
            </span>
          )}
        </span>
        <Select
          searchable
          label="Merchant type"
          placeholder="Select merchant type"
          options={types.map(([name]) => ({ value: name, label: name }))}
          value={typeName}
          onChange={(v) => { setTypeName(v); localStorage.setItem('chargeTypeLast', v) }}
        />
      </label>
      <fieldset className="pct-presets">
        <legend className="charge-legend">Charge rate{rate > 0 && <> — deducts {fmt(charges, currency)}</>}</legend>
        {presets.map((v) => (
          <label key={v} className={`pct-chip${rate === v ? ' on' : ''}`}>
            <input
              type="radio"
              name="charge-rate"
              value={v}
              checked={rate === v}
              onChange={() => setSel(String(v))}
              onClick={() => setSel(rate === v ? '' : String(v))}
            />
            {v}%
          </label>
        ))}
        <input
          type="number"
          className="pct-custom"
          step="0.01"
          min="0"
          placeholder="Custom %"
          aria-label="Custom charge rate"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        />
      </fieldset>
      <label>
        Merchant Charges
        <input key={fmt(charges, currency)} type="text" readOnly value={fmt(charges, currency)} aria-label="Merchant charges (calculated)" />
      </label>
      <label>
        Final CC Amount
        <input key={fmt(ccAmt, currency)} type="text" readOnly value={fmt(ccAmt, currency)} aria-label="Final CC amount (calculated)" />
      </label>
      <label className={`charge-final${finalAmt < 0 ? ' neg' : ''}`}>
        <span className="charge-final-head">
          Retailer Misc Charges
          <button
            type="button"
            className="charge-eye"
            onClick={() => setReveal(!reveal)}
            aria-label={reveal ? 'Collapse retailer misc charges' : 'Expand retailer misc charges'}
            aria-expanded={reveal}
            data-tip={reveal ? 'Collapse' : 'Expand'}
          >
            {reveal ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </span>
        <div className={`charge-reveal${reveal ? ' open' : ''}`} aria-hidden={!reveal}>
          <div>
            <input key={fmt(finalAmt, currency)} type="text" readOnly tabIndex={reveal ? 0 : -1}
              value={fmt(finalAmt, currency)} aria-label="Retailer misc charges (calculated)" />
          </div>
        </div>
      </label>
    </div>
  )
}
