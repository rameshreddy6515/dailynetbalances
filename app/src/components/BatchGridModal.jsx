import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Equal, Loader2, RotateCcw, Save, Star, Zap } from 'lucide-react'
import { supabase } from '../supabase'
import { displayDate, evalMoneyExpr, fmt, localToday, toNumber } from '../format'
import { AccessibleDialog } from './ConfirmDialog'
import DatePicker from './DatePicker'
import MerchantAvatar from './MerchantAvatar'

const fmtPlain = (n) => {
  const v = Math.round(toNumber(n) * 100) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

const COLS = ['opening', 'closing', 'bank', 'misc', 'notes']

function GridMoneyCell({
  value,
  placeholder = '0.00',
  currency,
  tabIndex = 0,
  ariaLabel,
  invalid = false,
  inputRef,
  onChange,
  onMoveRow,
  onCtrlEnter,
  trailing,
}) {
  const parsed = evalMoneyExpr(value)
  const commitExpr = () => {
    if (!parsed.isExpr || !parsed.valid) return value
    const evaluated = fmtPlain(parsed.value)
    onChange(evaluated)
    return evaluated
  }

  return (
    <div className={`batch-cell-wrap${invalid ? ' invalid' : ''}`}>
      <span className="money-field batch-money-field">
        {currency && <span className="money-prefix" aria-hidden="true">{currency}</span>}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          tabIndex={tabIndex}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const raw = e.target.value
            if (raw.endsWith('=')) {
              const next = evalMoneyExpr(raw)
              if (next.valid) {
                onChange(fmtPlain(next.value))
                return
              }
            }
            onChange(raw)
          }}
          onBlur={commitExpr}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              commitExpr()
              onCtrlEnter?.()
              return
            }
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              commitExpr()
              onMoveRow?.(1)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              commitExpr()
              onMoveRow?.(-1)
            }
          }}
        />
        {trailing}
      </span>
      {parsed.isExpr && parsed.valid && (
        <span className="batch-math-hint">= {fmt(parsed.value, currency)}</span>
      )}
    </div>
  )
}

export default function BatchGridModal({
  merchants = [],
  pinnedMerchants = [],
  walletRows = [],
  initialBalances = {},
  logoUrls = {},
  currency = '₹',
  initialDate = '',
  initialPending = false,
  onBatchSave,
  onConfirm,
  onClose,
}) {
  const [date, setDate] = useState(() => initialDate || localToday())
  const [onlyPending, setOnlyPending] = useState(initialPending)
  const [expanded, setExpanded] = useState({})
  const [fastTab, setFastTab] = useState(true)
  const [edits, setEdits] = useState({})
  const [dayExtras, setDayExtras] = useState({})
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState('')
  const cellRefs = useRef({})
  const didAutoFocus = useRef(false)

  useEffect(() => {
    if (!supabase || !date) return
    let cancelled = false
    const loadExtras = async () => {
      let { data, error } = await supabase
        .from('daily_balances')
        .select('id, notes, entry_type, tags')
        .eq('balance_date', date)
      if (error) {
        ;({ data, error } = await supabase
          .from('daily_balances')
          .select('id, notes')
          .eq('balance_date', date))
      }
      if (cancelled || error || !data) return
      const map = {}
      for (const r of data) map[r.id] = r
      setDayExtras((prev) => ({ ...prev, [date]: map }))
    }
    loadExtras()
    return () => {
      cancelled = true
    }
  }, [date])

  const pinnedSet = useMemo(() => new Set(pinnedMerchants), [pinnedMerchants])

  const rows = useMemo(() => {
    const byMerchant = {}
    for (const r of walletRows) (byMerchant[r.merchant_name] ||= []).push(r)
    const extrasForDate = dayExtras[date] || {}

    return merchants.map((m) => {
      const mRows = byMerchant[m] || []
      const existing = mRows.find((r) => r.balance_date === date) || null
      const prior = mRows.find((r) => r.balance_date < date) || null
      const extra = existing ? extrasForDate[existing.id] : null

      const baseOpeningNum = existing
        ? toNumber(existing.opening_balance)
        : prior
          ? toNumber(prior.closing_balance)
          : toNumber(initialBalances?.[m])
      const baseClosingNum = existing ? toNumber(existing.closing_balance) : null
      const baseBankNum = existing ? toNumber(existing.bank_amount) : 0
      const baseMiscNum = existing ? toNumber(existing.misc_expense) : 0
      const baseNotes = existing ? String(extra?.notes ?? existing.notes ?? '') : ''
      const legacyCashOut = existing ? toNumber(existing.cash_out) : 0

      const baseline = {
        opening: fmtPlain(baseOpeningNum),
        closing: existing ? fmtPlain(baseClosingNum) : '',
        bank: baseBankNum ? fmtPlain(baseBankNum) : '',
        misc: baseMiscNum ? fmtPlain(baseMiscNum) : '',
        notes: baseNotes,
      }

      const key = `${date}::${m}`
      const edit = edits[key] || null
      const rawOpening = edit?.opening !== undefined ? edit.opening : baseline.opening
      const rawClosing = edit?.closing !== undefined ? edit.closing : baseline.closing
      const rawBank = edit?.bank !== undefined ? edit.bank : baseline.bank
      const rawMisc = edit?.misc !== undefined ? edit.misc : baseline.misc
      const rawNotes = edit?.notes !== undefined ? edit.notes : baseline.notes

      const pOpen = evalMoneyExpr(rawOpening)
      const pClose = evalMoneyExpr(rawClosing)
      const pBank = evalMoneyExpr(rawBank)
      const pMisc = evalMoneyExpr(rawMisc)

      const openingInvalid = rawOpening.trim() !== '' && !pOpen.valid
      const closingInvalid = rawClosing.trim() !== '' && !pClose.valid
      const bankInvalid = rawBank.trim() !== '' && !pBank.valid
      const miscInvalid = rawMisc.trim() !== '' && !pMisc.valid

      const openingNum = rawOpening.trim() === '' ? 0 : pOpen.value
      const bankNum = rawBank.trim() === '' ? 0 : pBank.value
      const miscNum = rawMisc.trim() === '' ? 0 : pMisc.value
      const hasClosing = rawClosing.trim() !== '' && pClose.valid
      const closingNum = hasClosing ? pClose.value : 0

      const expectedSameClosing = Math.round((openingNum - legacyCashOut - bankNum - miscNum) * 100) / 100
      const changeNum = hasClosing
        ? Math.round((closingNum - openingNum + legacyCashOut + bankNum + miscNum) * 100) / 100
        : null

      const anyInvalid = openingInvalid || closingInvalid || bankInvalid || miscInvalid
      let status = 'pending'
      if (existing) {
        if (anyInvalid || rawClosing.trim() === '') {
          status = 'invalid'
        } else {
          const changed =
            Math.abs(openingNum - baseOpeningNum) > 0.004 ||
            Math.abs(closingNum - baseClosingNum) > 0.004 ||
            Math.abs(bankNum - baseBankNum) > 0.004 ||
            Math.abs(miscNum - baseMiscNum) > 0.004 ||
            rawNotes.trim() !== baseNotes.trim()
          status = changed ? 'edited' : 'saved'
        }
      } else if (anyInvalid) {
        status = 'invalid'
      } else if (hasClosing) {
        status = 'ready'
      } else if (
        rawBank.trim() !== '' ||
        rawMisc.trim() !== '' ||
        rawNotes.trim() !== '' ||
        Math.abs(openingNum - baseOpeningNum) > 0.004
      ) {
        status = 'incomplete'
      }

      const openingHint = existing
        ? 'Logged on this date'
        : prior
          ? `Carried from ${displayDate(prior.balance_date)}`
          : baseOpeningNum > 0
            ? 'Initial balance'
            : 'No prior record'

      return {
        key,
        merchant: m,
        pinned: pinnedSet.has(m),
        existing,
        extra,
        hasEdit: Boolean(edit),
        openingHint,
        rawOpening,
        rawClosing,
        rawBank,
        rawMisc,
        rawNotes,
        openingInvalid,
        closingInvalid: closingInvalid || Boolean(existing && rawClosing.trim() === ''),
        bankInvalid,
        miscInvalid,
        openingNum,
        closingNum,
        bankNum,
        miscNum,
        expectedSameClosing,
        changeNum,
        priorClosing: prior ? toNumber(prior.closing_balance) : baseOpeningNum,
        status,
      }
    })
  }, [merchants, walletRows, initialBalances, dayExtras, date, edits, pinnedSet])

  const pendingCount = rows.filter((r) => !r.existing).length
  const savedCount = rows.length - pendingCount
  const visibleRows = onlyPending ? rows.filter((r) => !r.existing) : rows

  useEffect(() => {
    if (didAutoFocus.current || !visibleRows.length) return
    if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) return
    const firstTarget = visibleRows.find((r) => !r.existing) || visibleRows[0]
    if (!firstTarget) return
    didAutoFocus.current = true
    requestAnimationFrame(() => {
      const el = cellRefs.current[`${firstTarget.merchant}::closing`]
      el?.focus()
      el?.select?.()
    })
  }, [visibleRows])

  const updateCell = (row, field, value) => {
    setValidation('')
    setEdits((prev) => ({
      ...prev,
      [row.key]: {
        ...(prev[row.key] || {}),
        [field]: value,
      },
    }))
  }

  const resetRow = (row) => {
    setValidation('')
    setEdits((prev) => {
      if (!prev[row.key]) return prev
      const next = { ...prev }
      delete next[row.key]
      return next
    })
  }

  const fillSameForRow = (row) => {
    updateCell(row, 'closing', fmtPlain(row.expectedSameClosing))
  }

  const fillAllPendingSame = () => {
    setValidation('')
    setEdits((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (r.existing || r.rawClosing.trim() !== '' || r.expectedSameClosing < 0 || r.status === 'invalid') continue
        next[r.key] = {
          ...(next[r.key] || {}),
          closing: fmtPlain(r.expectedSameClosing),
        }
      }
      return next
    })
  }

  const moveRowFocus = (merchantName, col, delta) => {
    const idx = visibleRows.findIndex((r) => r.merchant === merchantName)
    if (idx < 0) return
    const target = visibleRows[idx + delta]
    if (!target) return
    const el = cellRefs.current[`${target.merchant}::${col}`]
    el?.focus()
    el?.select?.()
  }

  const summary = useMemo(() => {
    let toInsert = 0
    let toUpdate = 0
    let invalidCount = 0
    let incompleteCount = 0
    let projectedWallet = 0
    let dayChange = 0
    let dayBank = 0
    let dayMisc = 0

    for (const r of rows) {
      if (r.status === 'ready') toInsert += 1
      else if (r.status === 'edited') toUpdate += 1
      else if (r.status === 'invalid') invalidCount += 1
      else if (r.status === 'incomplete') incompleteCount += 1

      if (r.status === 'ready' || r.status === 'edited' || r.status === 'saved') {
        projectedWallet += r.closingNum
        dayChange += r.changeNum || 0
        dayBank += r.bankNum
        dayMisc += r.miscNum
      } else {
        projectedWallet += r.priorClosing
      }
    }

    return {
      toInsert,
      toUpdate,
      totalActionable: toInsert + toUpdate,
      invalidCount,
      incompleteCount,
      projectedWallet,
      dayChange,
      dayBank,
      dayMisc,
    }
  }, [rows])

  const requestClose = async () => {
    if (saving) return
    if (Object.keys(edits).length && onConfirm) {
      const ok = await onConfirm(
        'Discard your unsaved batch edits?',
        { confirmLabel: 'Discard', danger: true }
      )
      if (!ok) return
    }
    onClose()
  }

  const handleSaveAll = async (e) => {
    e?.preventDefault()
    if (saving) return

    if (problem) {
      setValidation(`Check ${problemField} for ${problem.merchant} before saving.`)
      if (problem.existing) setOnlyPending(false)
      requestAnimationFrame(() => cellRefs.current[`${problem.merchant}::${problemField}`]?.focus())
      return
    }

    const inserts = []
    const updates = []
    const zeroClosings = []

    for (const r of rows) {
      if (r.status !== 'ready' && r.status !== 'edited') continue
      if (r.closingNum === 0 && r.openingNum > 0) zeroClosings.push(r.merchant)

      const payload = {
        merchant_name: r.merchant,
        balance_date: date,
        opening_balance: r.openingNum,
        bank_amount: r.bankNum,
        misc_expense: r.miscNum,
        entry_type: r.extra?.entry_type || r.existing?.entry_type || 'daily',
        closing_balance: r.closingNum,
        tags: r.extra?.tags ?? r.existing?.tags ?? [],
        notes: r.rawNotes.trim() || null,
      }

      if (r.status === 'ready') inserts.push(payload)
      else updates.push({ id: r.existing.id, payload })
    }

    if (!inserts.length && !updates.length) {
      setValidation('Enter at least one closing balance (or modify an existing row) to save.')
      return
    }

    setValidation('')
    setSaving(true)
    try {
      if (zeroClosings.length && onConfirm) {
        const names = zeroClosings.join(', ')
        const sure = await onConfirm(
          `Closing balance is 0 for ${names} even though opening balance is above 0. Save ${currency}0.00 closing?`
        )
        if (!sure) return
      }

      const ok = await onBatchSave(inserts, updates, date)
      if (ok) {
        setEdits((prev) => {
          const next = { ...prev }
          for (const r of rows) delete next[r.key]
          return next
        })
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const problem = rows.find((r) => ['invalid', 'incomplete'].includes(r.status))
  const problemField = COLS.find((c) => problem?.[`${c}Invalid`]) || 'closing'
  const blankPendingCount = rows.filter((r) => !r.existing && !r.rawClosing.trim() && r.expectedSameClosing >= 0 && r.status !== 'invalid').length
  const nonClosingTab = fastTab ? -1 : 0

  return (
    <AccessibleDialog
      title="Batch EOD Grid"
      className="batch-grid-dialog"
      onClose={requestClose}
    >
      <form className="batch-grid-form" onSubmit={handleSaveAll} aria-busy={saving}>
        <div className="batch-toolbar">
          <div className="batch-toolbar-left">
            <div className="batch-date-wrap">
              <DatePicker
                value={date}
                onChange={(d) => {
                  if (d) {
                    setValidation('')
                    setDate(d)
                  }
                }}
                label="Batch entry date"
              />
            </div>
            <div className="seg-group batch-filter-seg" role="group" aria-label="Filter merchants">
              <button
                type="button"
                className={`seg-btn${!onlyPending ? ' on' : ''}`}
                onClick={() => setOnlyPending(false)}
              >
                All ({rows.length})
              </button>
              <button
                type="button"
                className={`seg-btn${onlyPending ? ' on' : ''}`}
                onClick={() => setOnlyPending(true)}
              >
                Pending ({pendingCount})
              </button>
            </div>
          </div>

          <div className="batch-toolbar-right">
            <button
              type="button"
              className={`small secondary batch-fast-btn${fastTab ? ' active' : ''}`}
              aria-pressed={fastTab}
              onClick={() => setFastTab((v) => !v)}
              title="When on, pressing Tab jumps straight down the Closing column across all merchants"
            >
              <Zap size={13} aria-hidden="true" />
              <span>Tab: {fastTab ? 'Closing only' : 'All cells'}</span>
            </button>
            {blankPendingCount > 0 && (
              <button
                type="button"
                className="small secondary"
                onClick={fillAllPendingSame}
                title="Pre-fill every blank pending merchant with its expected unchanged closing balance"
              >
                <Equal size={13} aria-hidden="true" />
                <span>Fill {blankPendingCount} unchanged</span>
              </button>
            )}
          </div>
        </div>

        <p className="batch-subhint">
          <span>
            {savedCount} logged · {pendingCount} pending for <strong>{displayDate(date)}</strong>.
          </span>
          <span className="batch-kbd-hint">
            Tip: <code>Enter</code> / <code>↓</code><code>↑</code> moves between rows · math like <code>5000+1200</code> works · <code>Ctrl+Enter</code> saves all.
          </span>
        </p>

        {validation && <p className="message error batch-msg" role="alert">{validation}</p>}

        {!merchants.length ? (
          <p className="batch-empty">Add merchants in Merchant Settings first to start batch logging.</p>
        ) : !visibleRows.length ? (
          <div className="batch-empty">
            <p>All {rows.length} merchants already have an entry for {displayDate(date)}.</p>
            <button type="button" className="small secondary" onClick={() => setOnlyPending(false)}>
              Show all {rows.length} rows to review or edit
            </button>
          </div>
        ) : (
          <div className="batch-table-scroll">
            <table className="batch-table" aria-label="Batch end-of-day balance grid">
              <thead>
                <tr>
                  <th scope="col">Merchant</th>
                  <th scope="col">Opening</th>
                  <th scope="col" className="batch-col-closing">Closing *</th>
                  <th scope="col">Moved to Bank</th>
                  <th scope="col">Misc Exp</th>
                  <th scope="col" className="batch-col-change">Net Change</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const needsDetails = ['incomplete', 'invalid'].includes(row.status)
                  const details = needsDetails || expanded[row.key]
                  const setRef = (col) => (el) => {
                    cellRefs.current[`${row.merchant}::${col}`] = el
                  }
                  return (
                    <tr key={row.key} className={`batch-row status-${row.status}${details ? ' expanded' : ''}`}>
                      <td className="batch-cell-merchant">
                        <div className="batch-merchant-head">
                          <MerchantAvatar name={row.merchant} logoUrl={logoUrls[row.merchant]} />
                          <div className="batch-merchant-meta">
                            <strong>
                              <span>{row.merchant}</span>
                              {row.pinned && <Star size={11} className="pin-star" aria-hidden="true" />}
                            </strong>
                            <span className="batch-Carry">{row.openingHint}</span>
                            <span className="batch-mobile">Opening {fmt(row.openingNum, currency)}</span>
                          </div>
                          <span className={`batch-badge badge-${row.status}`}>
                            {row.status === 'ready' && 'Ready'}
                            {row.status === 'edited' && 'Edited'}
                            {row.status === 'saved' && <><Check size={11} aria-hidden="true" /> Saved</>}
                            {row.status === 'pending' && 'Pending'}
                            {row.status === 'incomplete' && 'Needs closing'}
                            {row.status === 'invalid' && 'Check'}
                          </span>
                        </div>
                      </td>

                      <td data-label="Opening">
                        <GridMoneyCell
                          inputRef={setRef('opening')}
                          value={row.rawOpening}
                          currency={currency}
                          tabIndex={nonClosingTab}
                          invalid={row.openingInvalid}
                          ariaLabel={`${row.merchant} opening balance`}
                          onChange={(v) => updateCell(row, 'opening', v)}
                          onMoveRow={(d) => moveRowFocus(row.merchant, 'opening', d)}
                          onCtrlEnter={handleSaveAll}
                        />
                      </td>

                      <td data-label="Closing *" className="batch-td-closing">
                        <GridMoneyCell
                          inputRef={setRef('closing')}
                          value={row.rawClosing}
                          placeholder={row.expectedSameClosing >= 0 ? fmtPlain(row.expectedSameClosing) : 'Enter closing'}
                          currency={currency}
                          tabIndex={0}
                          invalid={row.closingInvalid}
                          ariaLabel={`${row.merchant} closing balance`}
                          onChange={(v) => updateCell(row, 'closing', v)}
                          onMoveRow={(d) => moveRowFocus(row.merchant, 'closing', d)}
                          onCtrlEnter={handleSaveAll}
                          trailing={(
                            <button
                              type="button"
                              className="batch-eq-btn"
                              disabled={row.expectedSameClosing < 0 || row.openingInvalid || row.bankInvalid || row.miscInvalid}
                              tabIndex={nonClosingTab}
                              title={`Set closing to ${fmt(row.expectedSameClosing, currency)} (zero change)`}
                              aria-label={`Set ${row.merchant} closing equal to expected balance`}
                              onClick={() => fillSameForRow(row)}
                            >
                              <span className="batch-desktop">=</span><span className="batch-mobile">Use unchanged balance</span>
                            </button>
                          )}
                        />
                        <button className="batch-mobile secondary small" type="button" aria-expanded={Boolean(details)}
                          disabled={needsDetails}
                          onClick={() => setExpanded((prev) => ({ ...prev, [row.key]: !details }))}>
                          {needsDetails ? 'Details: check entry' : details ? 'Hide details' : 'Details'}
                        </button>
                      </td>

                      <td data-label="To Bank">
                        <GridMoneyCell
                          inputRef={setRef('bank')}
                          value={row.rawBank}
                          currency={currency}
                          tabIndex={nonClosingTab}
                          invalid={row.bankInvalid}
                          ariaLabel={`${row.merchant} moved to bank`}
                          onChange={(v) => updateCell(row, 'bank', v)}
                          onMoveRow={(d) => moveRowFocus(row.merchant, 'bank', d)}
                          onCtrlEnter={handleSaveAll}
                        />
                      </td>

                      <td data-label="Misc Exp">
                        <GridMoneyCell
                          inputRef={setRef('misc')}
                          value={row.rawMisc}
                          currency={currency}
                          tabIndex={nonClosingTab}
                          invalid={row.miscInvalid}
                          ariaLabel={`${row.merchant} miscellaneous expense`}
                          onChange={(v) => updateCell(row, 'misc', v)}
                          onMoveRow={(d) => moveRowFocus(row.merchant, 'misc', d)}
                          onCtrlEnter={handleSaveAll}
                        />
                      </td>

                      <td data-label="Net Change" className="batch-td-change">
                        {row.changeNum === null ? (
                          <span className="batch-change muted">—</span>
                        ) : (
                          <span className={`batch-change ${row.changeNum > 0.004 ? 'pos' : row.changeNum < -0.004 ? 'neg' : 'zero'}`}>
                            {row.changeNum > 0.004 ? '+' : row.changeNum < -0.004 ? '−' : ''}
                            {fmt(Math.abs(row.changeNum), currency)}
                          </span>
                        )}
                      </td>

                      <td data-label="Notes" className="batch-td-notes">
                        <div className="batch-notes-wrap">
                          <input
                            ref={setRef('notes')}
                            type="text"
                            tabIndex={nonClosingTab}
                            placeholder="Optional note"
                            aria-label={`${row.merchant} notes`}
                            value={row.rawNotes}
                            onChange={(e) => updateCell(row, 'notes', e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                handleSaveAll()
                                return
                              }
                              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                e.preventDefault()
                                moveRowFocus(row.merchant, 'notes', 1)
                                return
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                moveRowFocus(row.merchant, 'notes', -1)
                              }
                            }}
                          />
                          {row.hasEdit && (
                            <button
                              type="button"
                              className="batch-reset-btn"
                              tabIndex={nonClosingTab}
                              title={`Reset ${row.merchant} edits`}
                              aria-label={`Reset ${row.merchant} edits`}
                              onClick={() => resetRow(row)}
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="batch-footer">
          <div className="batch-totals" aria-live="polite">
            <div className="batch-total-pill">
              <span>Projected Wallet</span>
              <strong>{fmt(summary.projectedWallet, currency)}</strong>
            </div>
            <div className="batch-total-pill">
              <span>Day Change</span>
              <strong className={summary.dayChange > 0.004 ? 'pos' : summary.dayChange < -0.004 ? 'neg' : ''}>
                {summary.dayChange > 0.004 ? '+' : summary.dayChange < -0.004 ? '−' : ''}
                {fmt(Math.abs(summary.dayChange), currency)}
              </strong>
            </div>
            {summary.dayBank > 0 && (
              <div className="batch-total-pill">
                <span>To Bank</span>
                <strong>{fmt(summary.dayBank, currency)}</strong>
              </div>
            )}
            {summary.dayMisc > 0 && (
              <div className="batch-total-pill">
                <span>Misc</span>
                <strong>{fmt(summary.dayMisc, currency)}</strong>
              </div>
            )}
          </div>

          <div className="batch-actions">
            <span aria-live="polite">{summary.toInsert} new · {summary.toUpdate} edited</span>
            <button type="button" className="secondary" disabled={saving} onClick={requestClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={saving || (summary.totalActionable === 0 && summary.invalidCount === 0 && summary.incompleteCount === 0)}
            >
              {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
              <span>
                {saving
                  ? 'Saving…'
                  : problem ? `Fix ${problemField} for ${problem.merchant}`
                  : `Save ${summary.totalActionable} ${summary.totalActionable === 1 ? 'change' : 'changes'}`}
              </span>
            </button>
          </div>
        </div>
      </form>
    </AccessibleDialog>
  )
}
