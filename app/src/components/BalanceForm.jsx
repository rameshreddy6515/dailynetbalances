import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Plus, Save } from 'lucide-react'
import { supabase } from '../supabase'
import { localToday, fmt } from '../format'
import Select from './Select'
import DatePicker from './DatePicker'
import MerchantAvatar from './MerchantAvatar'

const DRAFT_KEY = 'balanceDraft'
const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const blank = () => ({
  merchant: '',
  date: localToday(),
  opening: '',
  bank: '',
  misc: '',
  closing: '',
  entryType: 'daily',
  notes: '',
})

const loadDraft = () => {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY))
    return draft ? { ...blank(), ...draft, date: localToday(), merchant: '' } : blank()
  } catch {
    return blank()
  }
}

const NumInput = ({ value, onChange, required }) => (
  <input
    type="number"
    step="0.01"
    min="0"
    placeholder="0.00"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    required={required}
  />
)

export default function BalanceForm({ merchants, initialBalances, editingRow, selectMerchant, copySource, currency, onSubmit, onConfirm, onCancelEdit, onClose, onBusyChange }) {
  const [form, setForm] = useState(loadDraft)
  const [openingSource, setOpeningSource] = useState(null)
  const [closingAuto, setClosingAuto] = useState(false)
  const [prefillTick, setPrefillTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)
  const [validation, setValidation] = useState('')
  const formRef = useRef(null)
  const closingTouched = useRef(false)
  const previousEditing = useRef(editingRow)

  useEffect(() => {
    onBusyChange?.(saving)
  }, [saving, onBusyChange])

  useEffect(() => {
    setOpeningSource(null)
    setClosingAuto(false)
    closingTouched.current = false
    if (editingRow) {
      setForm({
        merchant: editingRow.merchant_name || '',
        date: editingRow.balance_date || localToday(),
        opening: String(editingRow.opening_balance ?? 0),
        bank: String(editingRow.bank_amount ?? 0),
        misc: String(editingRow.misc_expense ?? 0),
        closing: String(editingRow.closing_balance ?? 0),
        entryType: editingRow.entry_type || 'daily',
        notes: editingRow.notes || '',
      })
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (previousEditing.current) {
      setForm((f) => ({ ...blank(), merchant: f.merchant }))
    }
    previousEditing.current = editingRow
  }, [editingRow])

  useEffect(() => {
    if (!selectMerchant) return
    setOpeningSource(null)
    setClosingAuto(false)
    setForm((f) => {
      if (f.merchant === selectMerchant) return f
      closingTouched.current = false
      return { ...f, merchant: selectMerchant, opening: '', closing: '', bank: '', misc: '' }
    })
  }, [selectMerchant])

  useEffect(() => {
    if (!copySource) return
    setOpeningSource(null)
    setClosingAuto(false)
    closingTouched.current = true
    setForm({
      merchant: copySource.merchant_name || '',
      date: copySource.balance_date || localToday(),
      opening: String(copySource.opening_balance ?? 0),
      bank: String(copySource.bank_amount ?? 0),
      misc: String(copySource.misc_expense ?? 0),
      closing: String(copySource.closing_balance ?? 0),
      entryType: copySource.entry_type || 'daily',
      notes: copySource.notes || '',
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [copySource])

  useEffect(() => {
    if (editingRow) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  }, [form, editingRow])

  useEffect(() => {
    if (!supabase || !form.merchant || !form.date || editingRow || copySource) return
    let cancelled = false
    supabase
      .from('daily_balances')
      .select('closing_balance, balance_date')
      .eq('merchant_name', form.merchant)
      .lte('balance_date', form.date)
      .order('balance_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        const prev = data?.[0]
        if (!error && prev && prev.closing_balance !== undefined && prev.closing_balance !== null) {
          const prevClose = Number(prev.closing_balance).toFixed(2)
          setForm((f) => ({
            ...f,
            opening: prevClose,
            closing: toNumber(f.closing) === 0 ? prevClose : f.closing,
          }))
          setOpeningSource(prev.balance_date)
          setClosingAuto(!closingTouched.current)
        } else {
          const init = Number(initialBalances?.[form.merchant]) || 0
          if (init > 0) {
            const initVal = init.toFixed(2)
            setForm((f) => ({
              ...f,
              opening: initVal,
              closing: toNumber(f.closing) === 0 ? initVal : f.closing,
            }))
            setOpeningSource('__init__')
            setClosingAuto(!closingTouched.current)
          } else {
            setOpeningSource(null)
            setClosingAuto(false)
          }
        }
      })
    return () => {
      cancelled = true
    }
  }, [form.merchant, form.date, editingRow, copySource, prefillTick, initialBalances])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const opening = toNumber(form.opening)
  const bank = toNumber(form.bank)
  const misc = toNumber(form.misc)
  const closing = toNumber(form.closing)
  const legacyCashIn = toNumber(editingRow?.cash_in)
  const legacyCashOut = toNumber(editingRow?.cash_out)
  const walletChange = closing - opening
  const expectedClosing = opening + legacyCashIn - legacyCashOut - bank - misc
  const todayChange = walletChange + legacyCashOut + bank + misc

  const resetForm = (keepMerchant = true) => {
    closingTouched.current = false
    setClosingAuto(false)
    setForm((f) => (keepMerchant ? { ...blank(), merchant: f.merchant } : blank()))
    localStorage.removeItem(DRAFT_KEY)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    const addAnother = e.nativeEvent.submitter?.value === 'another'
    const payload = {
      merchant_name: form.merchant.trim(),
      balance_date: form.date,
      opening_balance: opening,
      bank_amount: bank,
      misc_expense: misc,
      entry_type: form.entryType,
      closing_balance: closing,
      notes: form.notes.trim() || null,
    }
    if (!payload.merchant_name || !payload.balance_date) {
      setValidation(!payload.merchant_name ? 'Choose a merchant before saving.' : 'Choose a date before saving.')
      formRef.current?.querySelector(!payload.merchant_name ? '.select-btn' : '.datepicker .select-btn')?.focus()
      return
    }
    setValidation('')
    setSaving(true)
    try {
      if (closing === 0 && opening > 0) {
        const sure = await onConfirm(
          `End of day amount is 0 but opening balance is ${opening}. Is the wallet really empty?`
        )
        if (!sure) return
      }
      if (!editingRow && supabase) {
        const { count } = await supabase
          .from('daily_balances')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_name', payload.merchant_name)
          .eq('balance_date', payload.balance_date)
        if (
          count > 0 &&
          !(await onConfirm(
            `${count} record${count === 1 ? '' : 's'} already exist${count === 1 ? 's' : ''} for ${payload.merchant_name} on ${payload.balance_date}. Save another entry?`
          ))
        ) {
          return
        }
      }

      const ok = await onSubmit(payload, editingRow?.id, addAnother)
      if (ok) {
        if (addAnother) {
          closingTouched.current = false
          setForm(blank())
          localStorage.removeItem(DRAFT_KEY)
          formRef.current?.querySelector('.select-btn')?.focus()
        } else {
          resetForm()
        }
        setPrefillTick((t) => t + 1)
        setFlash(true)
        setTimeout(() => setFlash(false), 1600)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} aria-label="Balance entry" aria-busy={saving}>
      {validation && <p className="message error" role="alert">{validation}</p>}
      <div className="grid">
        <label>
          Merchant name
          <Select label="Merchant name" required invalid={!!validation && !form.merchant}
            options={[
              ...merchants.map((m) => ({ value: m, label: m, node: <span className="merchant-cell"><MerchantAvatar name={m} />{m}</span> })),
              ...(form.merchant && !merchants.includes(form.merchant)
                ? [{ value: form.merchant, label: form.merchant }]
                : []),
            ]}
            value={form.merchant}
            onChange={(v) => {
              if (v === form.merchant) return
              closingTouched.current = false
              setOpeningSource(null)
              setClosingAuto(false)
              setForm((f) => ({ ...f, merchant: v, opening: '', closing: '', bank: '', misc: '' }))
            }}
            placeholder="Select a merchant"
            searchable
          />
        </label>

        <label>
          Date
          <DatePicker label="Entry date" required invalid={!!validation && !form.date} value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </label>

        <label>
          Entry type
          <Select label="Entry type"
            options={[
              { value: 'daily', label: 'Daily balance' },
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expense' },
              { value: 'transfer', label: 'Transfer' },
            ]}
            value={form.entryType}
            onChange={(v) => setForm((f) => ({ ...f, entryType: v }))}
          />
        </label>
      </div>

      <div className="grid grid-tight">
        <label>
          Opening balance
          <NumInput
            value={form.opening}
            onChange={(v) => {
              setOpeningSource(null)
              setForm((f) => ({ ...f, opening: v, closing: closingTouched.current ? f.closing : v }))
            }}
            required
          />
          {openingSource === '__init__' ? (
            <span className="muted">From starting balance</span>
          ) : (
            openingSource && <span className="muted">From last closing</span>
          )}
        </label>

        <label data-tip="Money moved to bank today">
          Move to Bank
          <NumInput
            value={form.bank}
            onChange={(v) => {
              setForm((f) => {
                const delta = toNumber(v) - toNumber(f.bank)
                const nextClosing = Math.max(0, toNumber(f.closing) - delta)
                return {
                  ...f,
                  bank: v,
                  closing: !f.closing && f.opening
                    ? Math.max(0, toNumber(f.opening) - toNumber(v)).toFixed(2)
                    : nextClosing.toFixed(2),
                }
              })
            }}
          />
        </label>

        <label>
          Misc Expense
          <NumInput value={form.misc} onChange={(v) => setForm((f) => ({ ...f, misc: v }))} />
        </label>

        <label>
          End of day amount
          <NumInput
            value={form.closing}
            onChange={(v) => {
              closingTouched.current = true
              setClosingAuto(false)
              setForm((f) => ({ ...f, closing: v }))
            }}
            required
          />
          {closingAuto && <span className="muted">Prefilled — enter actual closing</span>}
        </label>
      </div>

      <div className="calc">
        Net change:{' '}
        <b className={todayChange >= 0 ? 'pos' : 'neg'}>
          {todayChange >= 0 ? '+' : '−'}{fmt(Math.abs(todayChange), currency)}
        </b>
        {form.closing !== '' && todayChange < -0.004 && (
          <span className="calc-moves">
            <button
              type="button"
              className="small secondary misc-move"
              data-tip="Record the missing amount as moved to bank"
              onClick={() =>
                setForm((f) => ({ ...f, bank: (toNumber(f.bank) + Math.abs(todayChange)).toFixed(2) }))
              }
            >
              Move {fmt(Math.abs(todayChange), currency)} to Bank
            </button>
            <button
              type="button"
              className="small secondary misc-move"
              data-tip="Record the missing amount as a miscellaneous expense"
              onClick={() =>
                setForm((f) => ({ ...f, misc: (toNumber(f.misc) + Math.abs(todayChange)).toFixed(2) }))
              }
            >
              Move {fmt(Math.abs(todayChange), currency)} to Misc
            </button>
          </span>
        )}
        <div className="muted">
          Expected closing {fmt(expectedClosing, currency)} · Wallet change (End of day − Opening):{' '}
          {walletChange >= 0 ? '+' : '−'}{fmt(Math.abs(walletChange), currency)}
        </div>
      </div>

      <label>
        Notes
        <textarea value={form.notes} onChange={set('notes')} placeholder="Optional remarks" />
      </label>

      <div className="actions entry-form-actions">
        <button type="submit" disabled={saving} className={flash ? 'btn-saved' : ''}>
          {saving ? (
            <>
              <Loader2 size={15} className="spin" /> Saving…
            </>
          ) : flash ? (
            <>
              <Check size={15} /> Saved!
            </>
          ) : (
            <>
              <Save size={15} /> {editingRow ? 'Update Entry' : 'Save Entry'}
            </>
          )}
        </button>
        {!editingRow && (
          <button type="submit" name="saveMode" value="another" className="secondary" disabled={saving}
            data-tip="Save and keep the panel open for the next merchant">
            <Plus size={15} /> Save & add another
          </button>
        )}
        <button type="button" className="secondary" disabled={saving} onClick={onClose || onCancelEdit}>
          Cancel
        </button>
        <button type="button" className="secondary" disabled={saving} onClick={() => { resetForm(false); onCancelEdit() }}>
          Reset
        </button>
      </div>

      <details className="hint">
        <summary>How is net change calculated?</summary>
        <p>
          <code>today change = end of day amount − opening balance + move to bank + misc expense</code>.
          Entering a Move to Bank amount lowers the end of day amount automatically, so the wallet drops and
          the next opening starts lower — money moved to bank and misc expense are added back because they
          only moved money, they are not profit or loss.
        </p>
      </details>
    </form>
  )
}
