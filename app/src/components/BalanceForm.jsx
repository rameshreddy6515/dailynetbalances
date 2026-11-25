import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, CircleHelp, Loader2, Plus, Save, Star } from 'lucide-react'
import { supabase } from '../supabase'
import { amountToWords, displayDate, evalMoneyExpr, fmt, localToday } from '../format'
import Select from './Select'
import DatePicker from './DatePicker'
import MerchantAvatar from './MerchantAvatar'

const DRAFT_KEY = 'balanceDraft'
const toNumber = (v) => evalMoneyExpr(v).value
const blank = () => ({
  merchant: '',
  date: localToday(),
  opening: '',
  bank: '',
  misc: '',
  closing: '',
  entryType: 'daily',
  tags: '',
  notes: '',
})

const SUGGESTED_TAGS = ['settlement', 'correction', 'misc', 'refund', 'own-expenses']

const parseTags = (value) =>
  [...new Set(String(value || '')
    .split(',')
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean))]

const loadDraft = (initialMerchant = '', initialDate = '') => {
  if (initialMerchant || initialDate) {
    return { ...blank(), merchant: initialMerchant || '', date: initialDate || localToday() }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY))
    if (draft && draft.merchant && draft.date === localToday()) {
      return { ...blank(), ...draft }
    }
    return blank()
  } catch {
    return blank()
  }
}

const formatEvaluated = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

const NumInput = ({ value, onChange, required, currency, indianFmt, showWords = false }) => {
  const parsed = evalMoneyExpr(value)
  const commitExpr = () => {
    if (!parsed.isExpr || !parsed.valid) return false
    onChange(formatEvaluated(parsed.value))
    return true
  }
  const words = showWords && parsed.value > 0 ? amountToWords(parsed.value, indianFmt) : ''
  return (
    <>
      <span className="money-field">
        {currency && <span className="money-prefix" aria-hidden="true">{currency}</span>}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => {
            const raw = e.target.value
            if (raw.endsWith('=')) {
              const next = evalMoneyExpr(raw)
              if (next.valid) {
                onChange(formatEvaluated(next.value))
                return
              }
            }
            onChange(raw)
          }}
          onBlur={commitExpr}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsed.isExpr && parsed.valid) {
              e.preventDefault()
              commitExpr()
            }
          }}
          required={required}
        />
      </span>
      {parsed.isExpr && parsed.valid && (
        <span className="math-preview">= {fmt(parsed.value, currency)}</span>
      )}
      {words && <span className="money-words">{words}</span>}
    </>
  )
}

export default function BalanceForm({
  merchants,
  pinnedMerchants = [],
  loggedByDate = {},
  indianFmt = true,
  initialBalances,
  logoUrls = {},
  editingRow,
  selectMerchant,
  selectDate,
  copySource,
  currency,
  onSubmit,
  onConfirm,
  onCancelEdit,
  onClose,
  onBusyChange,
}) {
  const [form, setForm] = useState(() => loadDraft(selectMerchant, selectDate))
  const [openingSource, setOpeningSource] = useState(null)
  const [closingAuto, setClosingAuto] = useState(false)
  const [formulaOpen, setFormulaOpen] = useState(false)
  const [prefillTick, setPrefillTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)
  const [validation, setValidation] = useState('')
  const formRef = useRef(null)
  const jumpRowRef = useRef(null)
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
        tags: (editingRow.tags || []).join(', '),
        notes: editingRow.notes || '',
      })
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (previousEditing.current) {
      setForm((f) => ({ ...blank(), merchant: f.merchant }))
    }
    previousEditing.current = editingRow
  }, [editingRow])

  useEffect(() => {
    if (!selectMerchant && !selectDate) return
    setOpeningSource(null)
    setClosingAuto(false)
    setForm((f) => {
      const nextMerchant = selectMerchant || f.merchant
      const nextDate = selectDate || f.date
      if (f.merchant === nextMerchant && f.date === nextDate) return f
      closingTouched.current = false
      return { ...f, merchant: nextMerchant, date: nextDate, opening: '', closing: '', bank: '', misc: '' }
    })
  }, [selectMerchant, selectDate])

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
      tags: (copySource.tags || []).join(', '),
      notes: copySource.notes || '',
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [copySource])

  useEffect(() => {
    if (editingRow) return
    if (!form.merchant && !form.bank && !form.misc && !form.notes && !form.tags) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
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

  useEffect(() => {
    jumpRowRef.current
      ?.querySelector('.merchant-chip.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [form.merchant])

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

  const pinnedSet = new Set(pinnedMerchants)
  const loggedSet = loggedByDate[form.date]
  const curIdx = merchants.indexOf(form.merchant)
  const orderedAfter = curIdx >= 0
    ? [...merchants.slice(curIdx + 1), ...merchants.slice(0, curIdx)]
    : merchants
  const nextPending = form.merchant
    ? orderedAfter.find((m) => m !== form.merchant && !(loggedSet && loggedSet.has(m))) || ''
    : ''
  const pendingChips = merchants.filter((m) => !(loggedSet && loggedSet.has(m)))
  const dateLabel = form.date === localToday() ? 'today' : (form.date ? displayDate(form.date) : 'the selected date')

  const switchMerchant = async (v) => {
    if (!v || v === form.merchant) return
    const hasTypedAmounts =
      closingTouched.current ||
      toNumber(form.bank) !== 0 ||
      toNumber(form.misc) !== 0 ||
      (form.opening !== '' && !openingSource)
    if (hasTypedAmounts && onConfirm) {
      const ok = await onConfirm(
        `Switch to "${v}"? The amounts you entered for ${form.merchant ? `"${form.merchant}"` : 'this entry'} will be cleared.`,
        { confirmLabel: 'Switch' }
      )
      if (!ok) return
    }
    closingTouched.current = false
    setOpeningSource(null)
    setClosingAuto(false)
    setForm((f) => ({ ...f, merchant: v, opening: '', closing: '', bank: '', misc: '' }))
  }

  const resetForm = (keepMerchant = true) => {
    closingTouched.current = false
    setClosingAuto(false)
    setForm((f) => (keepMerchant ? { ...blank(), merchant: f.merchant } : blank()))
    localStorage.removeItem(DRAFT_KEY)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    const submitMode = e.nativeEvent.submitter?.value || ''
    const addAnother = submitMode === 'another'
    const goNextPending = submitMode === 'nextPending'
    const targetNext = goNextPending ? nextPending : ''
    const keepOpen = addAnother || Boolean(targetNext)
    const payload = {
      merchant_name: form.merchant.trim(),
      balance_date: form.date,
      opening_balance: opening,
      bank_amount: bank,
      misc_expense: misc,
      entry_type: form.entryType,
      closing_balance: closing,
      tags: editingRow && editingRow.tags === undefined ? undefined : parseTags(form.tags),
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
          `Closing balance is 0 but opening balance is ${opening}. Is the wallet really empty?`
        )
        if (!sure) return
      }

      const ok = await onSubmit(payload, editingRow?.id, keepOpen)
      if (ok) {
        if (targetNext) {
          closingTouched.current = false
          setOpeningSource(null)
          setClosingAuto(false)
          setForm({ ...blank(), date: form.date, merchant: targetNext })
          localStorage.removeItem(DRAFT_KEY)
        } else if (addAnother) {
          closingTouched.current = false
          setForm(blank())
          localStorage.removeItem(DRAFT_KEY)
          formRef.current?.querySelector('.select-btn')?.focus()
        } else {
          resetForm(false)
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
      {!editingRow && !copySource && merchants.length > 0 && (
        pendingChips.length ? (
          <div className="merchant-jump" role="group" aria-label="Pending merchants">
            <span className="merchant-jump-label">
              Pending {dateLabel} · {pendingChips.length} left
            </span>
            <div className="merchant-jump-row" ref={jumpRowRef}>
              {pendingChips.map((m) => (
                <button key={m} type="button"
                  className={`merchant-chip${m === form.merchant ? ' active' : ''}`}
                  title={`Switch to ${m}`}
                  onClick={() => switchMerchant(m)}>
                  <MerchantAvatar name={m} logoUrl={logoUrls[m]} />
                  <span className="merchant-chip-name">{m}</span>
                  {pinnedSet.has(m) && <Star size={10} className="pin-star" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="merchant-jump done">
            <Check size={13} aria-hidden="true" /> All {merchants.length} merchant{merchants.length === 1 ? '' : 's'} logged {dateLabel === 'today' ? 'today' : `for ${dateLabel}`}.
          </p>
        )
      )}
      <div className="grid">
        <label>
          Merchant name
          <Select label="Merchant name" className="merchant-select" required invalid={!!validation && !form.merchant}
            options={[
              ...merchants.map((m) => ({
                value: m,
                label: m,
                node: (
                  <span className="merchant-cell">
                    <MerchantAvatar name={m} logoUrl={logoUrls[m]} />
                    {m}
                    {pinnedSet.has(m) && <Star size={12} className="pin-star" aria-label="Pinned" />}
                  </span>
                ),
              })),
              ...(form.merchant && !merchants.includes(form.merchant)
                ? [{ value: form.merchant, label: form.merchant }]
                : []),
            ]}
            value={form.merchant}
            onChange={switchMerchant}
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

      <div className="money-grid-head">
        <span>Amounts</span>
        <span className="math-tip">Inline math supported (e.g. 1200+350)</span>
      </div>
      <div className="grid grid-tight money-grid">
        <label>
          Opening balance
          <NumInput
            value={form.opening}
            currency={currency}
            indianFmt={indianFmt}
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
            currency={currency}
            indianFmt={indianFmt}
            showWords
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
          <NumInput
            value={form.misc}
            currency={currency}
            indianFmt={indianFmt}
            showWords
            onChange={(v) => setForm((f) => ({ ...f, misc: v }))}
          />
        </label>

        <label className="closing-field">
          <span className="closing-label">
            Closing balance <span className="closing-pill">Actual EOD</span>
          </span>
          <NumInput
            value={form.closing}
            currency={currency}
            indianFmt={indianFmt}
            showWords
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
        <div className="calc-head">
          <div>
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
          </div>
          <button
            type="button"
            className="calc-help-btn"
            aria-expanded={formulaOpen}
            aria-label="How is net change calculated?"
            title="How is net change calculated?"
            onClick={() => setFormulaOpen((o) => !o)}
          >
            <CircleHelp size={15} />
          </button>
        </div>
        <div className="muted">
          Expected closing {fmt(expectedClosing, currency)} · Wallet change (Closing − Opening):{' '}
          {walletChange >= 0 ? '+' : '−'}{fmt(Math.abs(walletChange), currency)}
        </div>
        {formulaOpen && (
          <p className="calc-formula-note">
            <code>today change = closing − opening + move to bank + misc expense</code>. Moving money to bank
            lowers the wallet and next opening automatically; bank moves and misc are added back so transfers
            aren&apos;t counted as loss.
          </p>
        )}
      </div>

      <label>
        Tags
        <input
          type="text"
          value={form.tags}
          onChange={set('tags')}
          placeholder="e.g. settlement, correction"
          aria-describedby="tag-suggestions"
        />
      </label>
      <div className="tag-suggestions" id="tag-suggestions">
        {SUGGESTED_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`tag-chip tag-btn${parseTags(form.tags).includes(tag) ? ' on' : ''}`}
            aria-pressed={parseTags(form.tags).includes(tag)}
            onClick={() =>
              setForm((f) => {
                const tags = parseTags(f.tags)
                const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
                return { ...f, tags: next.join(', ') }
              })
            }
          >
            {tag}
          </button>
        ))}
      </div>

      <label>
        Notes
        <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional remarks" />
      </label>

      <div className="actions entry-form-actions">
        <div className="entry-save-group">
          <button type="submit" disabled={saving} className={`primary ${flash ? 'btn-saved' : ''}`}>
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
          {!editingRow && nextPending && (
            <button type="submit" name="saveMode" value="nextPending" className="secondary save-next-btn" disabled={saving}
              title={`Save and switch to ${nextPending}`}>
              <ArrowRight size={15} /> <span className="btn-ellipsis">Next: {nextPending}</span>
            </button>
          )}
          {!editingRow && (
            <button type="submit" name="saveMode" value="another" className="secondary save-another-btn" disabled={saving}
              title="Save and keep the panel open for another entry">
              <Plus size={15} /> <span>Add another</span>
            </button>
          )}
        </div>
        <div className="entry-dismiss-group">
          <button type="button" className="secondary" disabled={saving} onClick={() => { resetForm(false); onCancelEdit() }}>
            Reset
          </button>
          <button type="button" className="secondary" disabled={saving} onClick={onClose || onCancelEdit}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
