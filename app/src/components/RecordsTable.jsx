import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  Copy,
  Download,
  Eye,
  X,
  Loader2,
  MoreHorizontal,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { changeOf, fmt, toNumber, displayDate } from '../format'
import { AccessibleDialog } from './ConfirmDialog'
import Select from './Select'
import DatePicker from './DatePicker'
import MerchantAvatar from './MerchantAvatar'

const TYPE_LABELS = { daily: 'Daily', income: 'Income', expense: 'Expense', transfer: 'Transfer' }
const PAGE_SIZE = 50
const DEFAULT_HIDDEN = ['type', 'cashIn', 'cashOut', 'misc', 'running', 'notes']
const MONEY_COLS = ['opening', 'cashIn', 'cashOut', 'misc', 'closing', 'change', 'running']
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const rangePresets = () => {
  const now = new Date()
  const yest = new Date(now)
  yest.setDate(yest.getDate() - 1)
  const week = new Date(now)
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7))
  const month = new Date(now)
  month.setDate(1)
  const t = iso(now)
  return {
    today: [t, t],
    yesterday: [iso(yest), iso(yest)],
    week: [iso(week), t],
    month: [iso(month), t],
    all: ['', ''],
  }
}

const SORTERS = {
  date: (r) => `${r.balance_date || ''}|${r.created_at || ''}`,
  merchant: (r) => (r.merchant_name || '').toLowerCase(),
  type: (r) => r.entry_type || 'daily',
  opening: (r) => toNumber(r.opening_balance),
  cashIn: (r) => toNumber(r.cash_in),
  cashOut: (r) => toNumber(r.cash_out),
  misc: (r) => toNumber(r.misc_expense),
  closing: (r) => toNumber(r.closing_balance),
  change: (r) => changeOf(r),
}

export default function RecordsTable({
  records,
  loading,
  filters,
  merchants,
  currency,
  onFiltersChange,
  onRefresh,
  onEdit,
  onDelete,
  onCopy,
  onBackup,
  onRestoreFile,
  restoring = false,
  search = '',
  onSearchChange,
}) {
  const [sort, setSort] = useState({ key: null, dir: 1 })
  const [page, setPage] = useState(0)
  const restoreInputRef = useRef(null)
  const [printing, setPrinting] = useState(false)
  const [colsOpen, setColsOpen] = useState(false)
  const [swipedId, setSwipedId] = useState(null)
  const [detailRow, setDetailRow] = useState(null)
  const headingRef = useRef(null)
  const [hiddenCols, setHiddenCols] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('recordColumns.v2'))
      return Array.isArray(stored) ? stored : DEFAULT_HIDDEN
    } catch {
      return DEFAULT_HIDDEN
    }
  })
  const colsRef = useRef(null)
  const touchRef = useRef({})

  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  useEffect(() => {
    localStorage.setItem('recordColumns.v2', JSON.stringify(hiddenCols))
  }, [hiddenCols])
  useEffect(() => {
    if (!colsOpen) return
    const h = (e) => {
      if (!colsRef.current?.contains(e.target)) setColsOpen(false)
    }
    const escape = (e) => { if (e.key === 'Escape') { setColsOpen(false); colsRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', escape)
    }
  }, [colsOpen])

  useEffect(() => {
    setPage(0)
  }, [records])

  const runningById = useMemo(() => {
    const sorted = [...records].sort(
      (a, b) =>
        (a.balance_date || '').localeCompare(b.balance_date || '') ||
        (a.created_at || '').localeCompare(b.created_at || '')
    )
    const sums = {}
    const map = {}
    for (const r of sorted) {
      const key = r.merchant_name || ''
      sums[key] = (sums[key] || 0) + changeOf(r)
      map[r.id] = sums[key]
    }
    return map
  }, [records])

  const { bestId, worstId } = useMemo(() => {
    if (records.length < 2) return {}
    let best = records[0]
    let worst = records[0]
    for (const r of records) {
      if (changeOf(r) > changeOf(best)) best = r
      if (changeOf(r) < changeOf(worst)) worst = r
    }
    if (best.id === worst.id) return {}
    return { bestId: best.id, worstId: worst.id }
  }, [records])

  const sorted = useMemo(() => {
    if (!sort.key || !SORTERS[sort.key]) return records
    const get = SORTERS[sort.key]
    return [...records].sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return cmp * sort.dir
    })
  }, [records, sort])

  const totals = useMemo(
    () =>
      records.reduce(
        (t, r) => ({
          cashIn: t.cashIn + toNumber(r.cash_in),
          cashOut: t.cashOut + toNumber(r.cash_out),
          misc: t.misc + toNumber(r.misc_expense),
          change: t.change + changeOf(r),
        }),
        { cashIn: 0, cashOut: 0, misc: 0, change: 0 }
      ),
    [records]
  )

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageRows = printing ? sorted : sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  const actionButtons = (row, iconOnly = false) => (
    <div className="row-actions">
      {!iconOnly && <button type="button" className="small secondary" aria-label={`Details for ${row.merchant_name} on ${row.balance_date}`} onClick={() => setDetailRow(row)}><Eye size={14} /> Details</button>}
      <button
        type="button"
        className="small secondary"
        data-tip="Duplicate as new entry"
        aria-label={`Copy ${row.merchant_name} on ${row.balance_date}`}
        onClick={() => {
          setSwipedId(null)
          onCopy(row)
        }}
      >
        <Copy size={13} /> {!iconOnly && 'Copy'}
      </button>
      <button
        type="button"
        className="small secondary"
        data-tip="Edit this record"
        aria-label={`Edit ${row.merchant_name} on ${row.balance_date}`}
        onClick={() => {
          setSwipedId(null)
          onEdit(row)
        }}
      >
        <Pencil size={13} /> {!iconOnly && 'Edit'}
      </button>
      <button
        type="button"
        className="small danger"
        data-tip="Delete this record"
        aria-label={`Delete ${row.merchant_name} on ${row.balance_date}`}
        onClick={() => {
          setSwipedId(null)
          onDelete(row)
        }}
      >
        <Trash2 size={13} /> {!iconOnly && 'Delete'}
      </button>
    </div>
  )

  const columns = [
      { id: 'date', label: 'Date', sort: 'date', cell: (r) => r.balance_date },
      { id: 'merchant', label: 'Merchant', sort: 'merchant', cell: (r) => <span className="merchant-cell"><MerchantAvatar name={r.merchant_name} />{r.merchant_name}</span> },
      {
        id: 'type',
        label: 'Type',
        sort: 'type',
        hideable: true,
        cell: (r) => (
          <span className={`badge ${r.entry_type || 'daily'}`}>
            {TYPE_LABELS[r.entry_type] || 'Daily'}
          </span>
        ),
      },
      { id: 'opening', label: 'Opening', sort: 'opening', hideable: true, cell: (r) => fmt(r.opening_balance, currency) },
      { id: 'cashIn', label: 'Cash In', sort: 'cashIn', hideable: true, cell: (r) => fmt(r.cash_in, currency) },
      { id: 'cashOut', label: 'Cash Out', sort: 'cashOut', hideable: true, cell: (r) => (toNumber(r.cash_out) ? <span className="neg">−{fmt(Math.abs(toNumber(r.cash_out)), currency)}</span> : fmt(0, currency)) },
      { id: 'misc', label: 'Misc Exp', sort: 'misc', hideable: true, cell: (r) => fmt(r.misc_expense, currency) },
      { id: 'closing', label: 'Closing', sort: 'closing', hideable: true, cell: (r) => fmt(r.closing_balance, currency) },
      {
        id: 'change',
        label: 'Change',
        sort: 'change',
        tip: 'End of day − Opening + Cash Out + Misc',
        cell: (r) => {
          const c = changeOf(r)
          return (
            <span className={c >= 0 ? 'pos' : 'neg'}>
              {c >= 0 ? '+' : '−'}
              {fmt(Math.abs(c), currency)}
            </span>
          )
        },
      },
      { id: 'running', label: 'Running', hideable: true, cell: (r) => fmt(runningById[r.id], currency) },
      {
        id: 'notes',
        label: 'Notes',
        hideable: true,
        cell: (r) =>
          r.notes ? (
            <span className="cell-note" data-tip={r.notes}>
              {r.notes}
            </span>
          ) : (
            ''
          ),
      },
      { id: 'actions', label: 'Actions', noPrint: true, cell: (r) => (
        <button type="button" className="secondary" aria-haspopup="dialog" aria-label={`Details and actions for ${r.merchant_name} on ${r.balance_date}`} onClick={() => setDetailRow(r)}><MoreHorizontal size={18} /><span className="sr-only">Details and actions</span></button>
      ) },
  ]
  const visCols = columns.filter((c) => !c.hideable || !hiddenCols.includes(c.id))
  const cellClass = (c) => `${c.noPrint ? 'no-print' : ''} ${MONEY_COLS.includes(c.id) ? 'money-cell' : ''}`
  const COLS = visCols.length

  const exportCsv = () => {
    const header = ['Date', 'Merchant', 'Type', 'Opening', 'Cash In', 'Cash Out', 'Misc Exp', 'Closing', 'Change', 'Notes']
    const lines = [header.map((h) => `"${h}"`).join(',')]
    for (const r of sorted) {
      lines.push(
        [
          r.balance_date,
          r.merchant_name,
          TYPE_LABELS[r.entry_type] || r.entry_type || 'Daily',
          toNumber(r.opening_balance).toFixed(2),
          toNumber(r.cash_in).toFixed(2),
          toNumber(r.cash_out).toFixed(2),
          toNumber(r.misc_expense).toFixed(2),
          toNumber(r.closing_balance).toFixed(2),
          changeOf(r).toFixed(2),
          (r.notes || '').replaceAll('"', '""'),
        ]
          .map((v) => `"${v ?? ''}"`)
          .join(',')
      )
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balances-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const presets = rangePresets()
  const matchesPreset = (k) => presets[k]?.[0] === filters.from && presets[k]?.[1] === filters.to
  const activePreset = (filters.preset && matchesPreset(filters.preset) ? filters.preset : Object.keys(presets).find(matchesPreset)) || null
  const applyPreset = (k) => () => onFiltersChange({ ...filters, from: presets[k][0], to: presets[k][1], preset: k })
  const rangeLabel = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month' }[activePreset]
    || `${filters.from ? displayDate(filters.from) : 'Any date'} – ${filters.to ? displayDate(filters.to) : 'Any date'}`
  const removeFilter = (patch, clearSearch = false) => {
    onFiltersChange({ ...filters, ...patch })
    if (clearSearch) onSearchChange?.('')
    headingRef.current?.focus()
  }
  const detailAction = (fn) => {
    const row = detailRow
    flushSync(() => setDetailRow(null))
    fn(row)
  }

  const toggleCol = (id) =>
    setHiddenCols((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))

  const touchStart = (id) => (e) => {
    touchRef.current = { id, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, dy: 0 }
  }
  const touchMove = (e) => {
    const s = touchRef.current
    if (!s.id) return
    s.dx = e.touches[0].clientX - s.x
    s.dy = e.touches[0].clientY - s.y
  }
  const touchEnd = () => {
    const s = touchRef.current
    touchRef.current = {}
    if (!s.id) return
    if (Math.abs(s.dy) > Math.abs(s.dx)) return
    if (s.dx < -50) setSwipedId(s.id)
    else if (s.dx > 50) setSwipedId((cur) => (cur === s.id ? null : cur))
  }

  return (
    <div className="section records-section workspace-section">
      <div className="sec-head no-print">
        <h2 tabIndex={-1} ref={headingRef}>
          Saved balances{' '}
          <span className="count-chip" key={records.length}>
            {records.length}
          </span>
        </h2>
        <div className="cols-wrap" ref={colsRef}>
          <button type="button" className="secondary" aria-expanded={colsOpen} aria-controls="column-options" onClick={() => setColsOpen((o) => !o)}>
            <Columns3 size={16} /> Columns
          </button>
          {colsOpen && <div className="cols-pop" id="column-options">
            {columns.filter((c) => c.hideable).map((c) => (
              <label key={c.id} className="cols-item"><input type="checkbox" checked={!hiddenCols.includes(c.id)} onChange={() => toggleCol(c.id)} />{c.label}</label>
            ))}
            <button type="button" className="secondary" onClick={() => setHiddenCols(DEFAULT_HIDDEN)}>Reset columns</button>
          </div>}
        </div>
      </div>
      <>
          <div className="toolbar no-print">
            <label>
              Merchant
              <Select label="Filter by merchant"
                options={[{ value: '', label: 'All merchants' }, ...merchants.map((m) => ({ value: m, label: m, node: <span className="merchant-cell"><MerchantAvatar name={m} />{m}</span> }))]}
                value={filters.merchant}
                onChange={(v) => onFiltersChange({ ...filters, merchant: v })}
                placeholder="All merchants"
                searchable
              />
            </label>
            <label>
              From date
              <DatePicker label="From date" value={filters.from} onChange={(v) => onFiltersChange({ ...filters, from: v, preset: '' })} />
            </label>
            <label>
              To date
              <DatePicker label="To date" value={filters.to} onChange={(v) => onFiltersChange({ ...filters, to: v, preset: '' })} />
            </label>
            <div className="seg-group" role="group" aria-label="Quick date range">
              {[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(
                ([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`seg-btn ${activePreset === k ? 'on' : ''}`}
                    aria-pressed={activePreset === k}
                    onClick={applyPreset(k)}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
            <div className="actions">
              <button type="button" className="secondary" disabled={loading} onClick={onRefresh}>
                <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
              </button>
              <details className="menu-wrap more-actions">
                <summary className="secondary"><MoreHorizontal size={18} /> More actions</summary>
                <div className="menu-panel">
              <button type="button" className="secondary" data-tip="Download as CSV" onClick={exportCsv} disabled={!records.length}>
                <Download size={14} /> Export CSV
              </button>
              <button type="button" className="secondary" data-tip="Download JSON backup" onClick={onBackup}>
                <Download size={14} /> Backup
              </button>
              <button type="button" className="secondary" disabled={restoring} onClick={() => restoreInputRef.current?.click()}>
                {restoring ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {restoring ? 'Restoring…' : 'Restore'}
              </button>
              <button type="button" className="secondary" data-tip="Print records" onClick={() => window.print()}>
                <Printer size={14} /> Print
              </button>
                </div>
              </details>
              <input ref={restoreInputRef} type="file" accept=".json,application/json" hidden onChange={(e) => { onRestoreFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </div>

          {(filters.merchant || filters.from || filters.to || search.trim()) && (
            <div className="active-filters no-print" role="group" aria-label="Active filters">
              {filters.merchant && <button type="button" className="filter-chip" aria-label={`Remove merchant filter ${filters.merchant}`} onClick={() => removeFilter({ merchant: '' })}><span className="merchant-cell"><MerchantAvatar name={filters.merchant} />{filters.merchant}</span><X size={14} /></button>}
              {(filters.from || filters.to) && <button type="button" className="filter-chip" aria-label={`Remove date filter ${rangeLabel}`} onClick={() => removeFilter({ from: '', to: '', preset: '' })}>{rangeLabel}<X size={14} /></button>}
              {search.trim() && <button type="button" className="filter-chip" aria-label="Clear search" onClick={() => removeFilter({}, true)}>Search: {search.trim()}<X size={14} /></button>}
              <button type="button" className="secondary" onClick={() => removeFilter({ merchant: '', from: '', to: '', preset: '' }, true)}>Clear all</button>
            </div>
          )}
          {search.trim() && <p className="search-summary">Search results for “{search.trim()}” within loaded records.</p>}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {visCols.map((c) =>
                    c.sort ? (
                      <th
                        key={c.id}
                        className={`sortable ${cellClass(c)}`}
                        data-tip={c.tip}
                        aria-sort={sort.key === c.sort ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(c.sort) } }}
                        onClick={() => toggleSort(c.sort)}
                      >
                        {c.label}
                        {sort.key === c.sort &&
                          (sort.dir === 1 ? (
                            <ChevronUp size={11} className="sort-arrow" />
                          ) : (
                            <ChevronDown size={11} className="sort-arrow" />
                          ))}
                      </th>
                    ) : (
                      <th key={c.id} className={cellClass(c)} data-tip={c.tip}>
                        {c.label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td colSpan={COLS}>
                        <div className="skel" />
                      </td>
                    </tr>
                  ))
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS} className="empty">
                      {search || filters.merchant || filters.from || filters.to ? 'No matching records. Try changing the search or filters.' : 'No records yet. Use New Entry to add your first balance.'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const rowClass = row.id === bestId ? 'row-best' : row.id === worstId ? 'row-worst' : ''
                    return (
                      <tr key={row.id} className={rowClass}>
                        {visCols.map((c) => (
                          <td key={c.id} className={cellClass(c)}>
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loading && records.length > 0 && (
                <tfoot>
                  <tr>
                    {visCols.map((c) => {
                      if (c.id === 'date') return <td key={c.id}>Totals ({records.length} rows)</td>
                      if (c.id === 'cashIn') return <td key={c.id} className="money-cell">{fmt(totals.cashIn, currency)}</td>
                      if (c.id === 'cashOut') return <td key={c.id} className={`money-cell ${totals.cashOut ? 'neg' : ''}`}>{totals.cashOut ? `−${fmt(Math.abs(totals.cashOut), currency)}` : fmt(0, currency)}</td>
                      if (c.id === 'misc') return <td key={c.id} className="money-cell">{fmt(totals.misc, currency)}</td>
                      if (c.id === 'change')
                        return (
                          <td key={c.id} className={`money-cell ${totals.change >= 0 ? 'pos' : 'neg'}`}>
                            {fmt(totals.change, currency)}
                          </td>
                        )
                      return <td key={c.id} className={cellClass(c)}></td>
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="record-cards no-print">
            {!loading && !pageRows.length && <p className="empty">No matching records. Add an entry or adjust your filters.</p>}
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={`rskel-${i}`} className="record-card">
                    <div className="skel" style={{ width: '50%', marginBottom: 10 }} />
                    <div className="skel" style={{ width: '80%' }} />
                  </div>
                ))
              : pageRows.map((row) => {
                  const change = changeOf(row)
                  const rcClass =
                    row.id === bestId ? 'rc-best' : row.id === worstId ? 'rc-worst' : ''
                  return (
                    <div
                      key={row.id}
                      className={`record-card ${rcClass} ${swipedId === row.id ? 'swiped' : ''}`}
                      onTouchStart={touchStart(row.id)}
                      onTouchMove={touchMove}
                      onTouchEnd={touchEnd}
                    >
                      <div className="rc-reveal" inert={swipedId !== row.id ? true : undefined} aria-hidden={swipedId !== row.id}>{actionButtons(row, true)}</div>
                      <div
                        className="rc-body"
                        onClick={() => {
                          if (swipedId === row.id) setSwipedId(null)
                        }}
                      >
                        <div className="rc-head">
                          <span className="merchant-cell"><MerchantAvatar name={row.merchant_name} /><b>{row.merchant_name}</b></span>
                          <span className="muted">{row.balance_date}</span>
                        </div>
                        <div className="rc-nums">
                          <span>
                            Open <b>{fmt(row.opening_balance, currency)}</b>
                          </span>
                          <span>
                            Close <b>{fmt(row.closing_balance, currency)}</b>
                          </span>
                          <span>
                            Change{' '}
                            <b className={change >= 0 ? 'pos' : 'neg'}>
                              {change >= 0 ? '+' : '−'}
                              {fmt(Math.abs(change), currency)}
                            </b>
                          </span>
                        </div>
                        {row.notes && <div className="muted">{row.notes}</div>}
                        <button type="button" className="secondary mobile-details-button" aria-haspopup="dialog" aria-label={`Details and actions for ${row.merchant_name} on ${row.balance_date}`} onClick={() => { setSwipedId(null); setDetailRow(row) }}><MoreHorizontal size={18} /> Details / Actions</button>
                      </div>
                    </div>
                  )
                })}
            {!loading && records.length > 0 && (
              <div className="mobile-totals">
                <span>
                  {records.length} record{records.length === 1 ? '' : 's'} · Total change
                </span>
                <b className={`money-cell ${totals.change >= 0 ? 'pos' : 'neg'}`}>
                  {totals.change >= 0 ? '+' : '−'}
                  {fmt(Math.abs(totals.change), currency)}
                </b>
              </div>
            )}
          </div>

          <div className="table-footer no-print">
            <div className="muted">
              {!loading &&
                `Showing ${pageRows.length} of ${records.length} record${records.length === 1 ? '' : 's'}${filters.merchant ? ` for ${filters.merchant}` : ''}${filters.from || filters.to ? ` (${filters.from || '…'} → ${filters.to || '…'})` : ''}.`}
            </div>
            {totalPages > 1 && (
              <div className="pager">
                <button type="button" className="secondary small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  ← Prev
                </button>
                <span>
                  Page {currentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary small"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
      </>
      {detailRow && <AccessibleDialog title="Record details" onClose={() => setDetailRow(null)}>
        <p><span className="merchant-cell"><MerchantAvatar name={detailRow.merchant_name} /><strong>{detailRow.merchant_name}</strong></span> · {displayDate(detailRow.balance_date)}</p>
        <dl className="record-detail-list">
          <div><dt>Entry type</dt><dd>{TYPE_LABELS[detailRow.entry_type] || 'Daily'}</dd></div>
          {[['Opening', 'opening_balance'], ['Cash In', 'cash_in'], ['Cash Out', 'cash_out'], ['Misc Expense', 'misc_expense'], ['Closing', 'closing_balance']].map(([label, key]) => (
            <div key={key}><dt>{label}</dt><dd className={key === 'cash_out' && toNumber(detailRow[key]) ? 'neg' : ''}>{key === 'cash_out' && toNumber(detailRow[key]) ? `−${fmt(Math.abs(toNumber(detailRow[key])), currency)}` : fmt(detailRow[key], currency)}</dd></div>
          ))}
          <div><dt>Change</dt><dd className={changeOf(detailRow) >= 0 ? 'pos' : 'neg'}>{changeOf(detailRow) >= 0 ? '+' : '−'}{fmt(Math.abs(changeOf(detailRow)), currency)}</dd></div>
          <div><dt>Recorded</dt><dd>{displayDate(detailRow.created_at, true)}</dd></div>
        </dl>
        <h3>Notes</h3><p className="detail-notes">{detailRow.notes || 'No notes for this entry.'}</p>
        <div className="actions detail-actions">
          <button type="button" className="secondary" onClick={() => detailAction(onCopy)}><Copy size={16} /> Copy</button>
          <button type="button" className="secondary" onClick={() => detailAction(onEdit)}><Pencil size={16} /> Edit</button>
          <button type="button" className="danger" onClick={() => detailAction(onDelete)}><Trash2 size={16} /> Delete</button>
        </div>
      </AccessibleDialog>}
    </div>
  )
}
