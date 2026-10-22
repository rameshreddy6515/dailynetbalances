import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  Copy,
  Download,
  Eye,
  FileText,
  Inbox,
  X,
  Loader2,
  MoreHorizontal,
  Pencil,
  Printer,
  RefreshCw,
  Share2,
  SlidersHorizontal,
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
const MONEY_COLS = ['opening', 'cashIn', 'cashOut', 'bank', 'misc', 'closing', 'change', 'running']
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
  bank: (r) => toNumber(r.bank_amount),
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
  chainBreaks = new Map(),
  restoring = false,
  search = '',
  onSearchChange,
  flashId = null,
}) {
  const [sort, setSort] = useState({ key: null, dir: 1 })
  const [page, setPage] = useState(0)
  const restoreInputRef = useRef(null)
  const [printing, setPrinting] = useState(false)
  const [colsOpen, setColsOpen] = useState(false)
  const [swipedId, setSwipedId] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  const [theadShadow, setTheadShadow] = useState(false)

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

  // Map of chronological records to identify opening adjustments (audit trail)

  const totals = useMemo(
    () =>
      records.reduce(
        (t, r) => ({
          cashIn: t.cashIn + toNumber(r.cash_in),
          cashOut: t.cashOut + toNumber(r.cash_out),
          bank: t.bank + toNumber(r.bank_amount),
          misc: t.misc + toNumber(r.misc_expense),
          change: t.change + changeOf(r),
        }),
        { cashIn: 0, cashOut: 0, bank: 0, misc: 0, change: 0 }
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
      {
        id: 'opening',
        label: 'Opening',
        sort: 'opening',
        hideable: true,
        cell: (r) => (
          <span className="opening-cell">
            {fmt(r.opening_balance, currency)}
            {chainBreaks.has(r.id) && (
              <span className="adj-badge" data-tip={`Opening differs from previous closing (${fmt(chainBreaks.get(r.id), currency)})`}>
                Adj
              </span>
            )}
          </span>
        ),
      },
      { id: 'cashIn', label: 'Cash In', sort: 'cashIn', hideable: true, cell: (r) => fmt(r.cash_in, currency) },
      { id: 'cashOut', label: 'Cash Out', sort: 'cashOut', hideable: true, cell: (r) => (toNumber(r.cash_out) ? <span className="neg">−{fmt(Math.abs(toNumber(r.cash_out)), currency)}</span> : fmt(0, currency)) },
      { id: 'bank', label: 'To Bank', sort: 'bank', hideable: true, cell: (r) => fmt(r.bank_amount, currency) },
      { id: 'misc', label: 'Misc Exp', sort: 'misc', hideable: true, cell: (r) => fmt(r.misc_expense, currency) },
      { id: 'closing', label: 'Closing', sort: 'closing', hideable: true, cell: (r) => fmt(r.closing_balance, currency) },
      {
        id: 'change',
        label: 'Change',
        sort: 'change',
        tip: 'End of day − Opening + Cash Out + To Bank + Misc',
        cell: (r) => {
          const c = changeOf(r)
          const status = r.id === bestId ? 'Highest change' : r.id === worstId ? 'Lowest change' : ''
          return (
            <span className="change-cell">
              <span className={c >= 0 ? 'pos' : 'neg'} aria-label={`${c >= 0 ? 'Increase' : 'Decrease'} ${fmt(Math.abs(c), currency)}`}>
                {c >= 0 ? '+' : '−'}
                {fmt(Math.abs(c), currency)}
              </span>
              {status && <span className="record-status">{status}</span>}
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
    const header = ['Date', 'Merchant', 'Type', 'Opening', 'Cash In', 'Cash Out', 'To Bank', 'Misc Exp', 'Closing', 'Change', 'Notes']
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
          toNumber(r.bank_amount).toFixed(2),
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

  const exportMerchantPdf = async (merchantName) => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const mRows = records
      .filter((r) => r.merchant_name === merchantName)
      .sort((a, b) => (a.balance_date || '').localeCompare(b.balance_date || ''))
    if (!mRows.length) return

    const pdfCur = currency === '₹' ? 'Rs ' : `${currency} `
    const money = (v) => `${pdfCur}${toNumber(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text(`Statement: ${merchantName}`, 14, 15)
    doc.setFontSize(9)
    doc.setTextColor(110)
    doc.text(`Generated ${new Date().toLocaleString()} · ${mRows.length} entries recorded`, 14, 21)

    const mTotals = mRows.reduce(
      (acc, r) => ({
        cashOut: acc.cashOut + toNumber(r.cash_out),
        bank: acc.bank + toNumber(r.bank_amount),
        misc: acc.misc + toNumber(r.misc_expense),
        change: acc.change + changeOf(r),
      }),
      { cashOut: 0, bank: 0, misc: 0, change: 0 }
    )

    autoTable(doc, {
      startY: 26,
      head: [['Date', 'Type', 'Opening', 'Cash Out', 'To Bank', 'Misc', 'Closing', 'Net Change']],
      body: mRows.map((r) => [
        r.balance_date,
        TYPE_LABELS[r.entry_type] || r.entry_type || 'Daily',
        money(r.opening_balance),
        money(r.cash_out),
        money(r.bank_amount),
        money(r.misc_expense),
        money(r.closing_balance),
        money(changeOf(r)),
      ]),
      foot: [[
        'Total', '', '',
        money(mTotals.cashOut),
        money(mTotals.bank),
        money(mTotals.misc),
        '',
        money(mTotals.change),
      ]],
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229] },
      footStyles: { fillColor: [238, 242, 255], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
    })
    doc.save(`statement-${merchantName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const shareMerchantWhatsApp = (merchantName) => {
    const mRows = records
      .filter((r) => r.merchant_name === merchantName)
      .sort((a, b) => (b.balance_date || '').localeCompare(a.balance_date || ''))
    if (!mRows.length) return
    const latest = mRows[0]
    const mTotals = mRows.reduce(
      (acc, r) => ({
        cashOut: acc.cashOut + toNumber(r.cash_out),
        bank: acc.bank + toNumber(r.bank_amount),
        misc: acc.misc + toNumber(r.misc_expense),
        change: acc.change + changeOf(r),
      }),
      { cashOut: 0, bank: 0, misc: 0, change: 0 }
    )

    const text = [
      `*Merchant Daily Balance Statement*`,
      `Merchant: *${merchantName}*`,
      `Latest Date: ${latest.balance_date}`,
      `Closing Balance: ${fmt(latest.closing_balance, currency)}`,
      `Total Net Change: ${mTotals.change >= 0 ? '+' : '−'}${fmt(Math.abs(mTotals.change), currency)}`,
      `Total Moved to Bank: ${fmt(mTotals.bank, currency)}`,
      `Total Cash Out: ${fmt(mTotals.cashOut, currency)}`,
      `Entries Count: ${mRows.length}`,
    ].join('\n')

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const exportPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const pdfCur = currency === '₹' ? 'Rs ' : `${currency} ` // jsPDF default fonts lack the ₹ glyph
    const money = (v) => `${pdfCur}${toNumber(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(15)
    doc.text('Merchant Daily Balance', 14, 15)
    doc.setFontSize(9)
    doc.setTextColor(110)
    doc.text(
      `Generated ${new Date().toLocaleString()} · ${rangeLabel}${filters.merchant ? ` · ${filters.merchant}` : ''}${search.trim() ? ` · search: ${search.trim()}` : ''}`,
      14,
      21
    )
    autoTable(doc, {
      startY: 25,
      head: [['Date', 'Merchant', 'Type', 'Opening', 'Cash Out', 'To Bank', 'Misc', 'Closing', 'Change', 'Notes']],
      body: sorted.map((r) => [
        r.balance_date,
        r.merchant_name,
        TYPE_LABELS[r.entry_type] || r.entry_type || 'Daily',
        money(r.opening_balance),
        money(r.cash_out),
        money(r.bank_amount),
        money(r.misc_expense),
        money(r.closing_balance),
        money(changeOf(r)),
        r.notes || '',
      ]),
      foot: [[
        'Total', '', '', '',
        money(totals.cashOut), money(totals.bank), money(totals.misc), '', money(totals.change), '',
      ]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
      footStyles: { fillColor: [238, 242, 255], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    })
    doc.save(`balances-${new Date().toISOString().slice(0, 10)}.pdf`)
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
          <button type="button" className="secondary filters-toggle no-print" aria-expanded={filtersOpen} aria-controls="record-filters" onClick={() => setFiltersOpen((o) => !o)}>
            <SlidersHorizontal size={15} /> Filters <ChevronDown size={15} className={filtersOpen ? 'flip' : ''} />
          </button>
          <div className={`toolbar no-print${filtersOpen ? ' open' : ''}`} id="record-filters">
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
              <button type="button" className="secondary" data-tip="Download as PDF" onClick={exportPdf} disabled={!records.length}>
                <FileText size={14} /> Export PDF
              </button>
              {filters.merchant && (
                <button type="button" className="secondary" data-tip="Download statement for filtered merchant" onClick={() => exportMerchantPdf(filters.merchant)}>
                  <FileText size={14} /> Merchant Statement
                </button>
              )}
              {filters.merchant && (
                <button type="button" className="secondary" data-tip="Share merchant statement on WhatsApp" onClick={() => shareMerchantWhatsApp(filters.merchant)}>
                  <Share2 size={14} /> WhatsApp Statement
                </button>
              )}
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

          <div className={`table-wrap${theadShadow ? ' scrolled' : ''}`} onScroll={(e) => setTheadShadow(e.currentTarget.scrollTop > 2)}>
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
                      <div className="empty-state">
                        <Inbox size={30} aria-hidden="true" />
                        <p>{search || filters.merchant || filters.from || filters.to ? 'No matching records. Try changing the search or filters.' : 'No records yet. Use New Entry to add your first balance.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, i) => {
                    const rowClass = row.id === bestId ? 'row-best' : row.id === worstId ? 'row-worst' : ''
                    return (
                      <tr key={row.id} className={`${rowClass}${row.id === flashId ? ' row-flash' : ''}`} style={{ animationDelay: `${Math.min(i * 20, 320)}ms` }}>
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
                      if (c.id === 'bank') return <td key={c.id} className="money-cell">{fmt(totals.bank, currency)}</td>
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
            {!loading && !pageRows.length && (
              <div className="empty-state">
                <Inbox size={30} aria-hidden="true" />
                <p>No matching records. Add an entry or adjust your filters.</p>
              </div>
            )}
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={`rskel-${i}`} className="record-card">
                    <div className="skel" style={{ width: '50%', marginBottom: 10 }} />
                    <div className="skel" style={{ width: '80%' }} />
                  </div>
                ))
              : pageRows.map((row, i) => {
                  const change = changeOf(row)
                  const rcClass =
                    row.id === bestId ? 'rc-best' : row.id === worstId ? 'rc-worst' : ''
                  return (
                    <div
                      key={row.id}
                      style={{ animationDelay: `${Math.min(i * 20, 320)}ms` }}
                      className={`record-card ${rcClass} ${swipedId === row.id ? 'swiped' : ''} ${row.id === flashId ? 'row-flash' : ''}`}
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
                            <b className={`rc-change ${change >= 0 ? 'pos' : 'neg'}`} aria-label={`Net change ${change >= 0 ? 'increase' : 'decrease'} ${fmt(Math.abs(change), currency)}`}>
                            {change >= 0 ? '+' : '−'}
                            {fmt(Math.abs(change), currency)}
                          </b>
                        </div>
                        <div className="rc-nums">
                          <span className="muted">{row.balance_date}</span>
                            {row.id === bestId && <span className="record-status">Highest change</span>}
                            {row.id === worstId && <span className="record-status">Lowest change</span>}
                            <span>
                            Open <b>{fmt(row.opening_balance, currency)}</b>
                            {chainBreaks.has(row.id) && <span className="adj-badge" data-tip={`Opening differs from previous closing (${fmt(chainBreaks.get(row.id), currency)})`}>Adj</span>}
                          </span>
                          <span>
                            Close <b>{fmt(row.closing_balance, currency)}</b>
                          </span>
                        </div>
                        {row.notes && <div className="muted">{row.notes}</div>}
                        <button type="button" className="mobile-details-button" aria-haspopup="dialog" aria-label={`Details and actions for ${row.merchant_name} on ${row.balance_date}`} onClick={() => { setSwipedId(null); setDetailRow(row) }}><MoreHorizontal size={15} /> Details / Actions</button>
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
      {detailRow && <AccessibleDialog title="Record details" className="m-sheet" onClose={() => setDetailRow(null)}>
        <p><span className="merchant-cell"><MerchantAvatar name={detailRow.merchant_name} /><strong>{detailRow.merchant_name}</strong></span> · {displayDate(detailRow.balance_date)}</p>
        <dl className="record-detail-list">
          <div><dt>Entry type</dt><dd>{TYPE_LABELS[detailRow.entry_type] || 'Daily'}</dd></div>
          {[
            ['Opening', 'opening_balance'],
            ...(toNumber(detailRow.cash_in) ? [['Cash In', 'cash_in']] : []),
            ...(toNumber(detailRow.cash_out) ? [['Cash Out', 'cash_out']] : []),
            ['To Bank', 'bank_amount'],
            ['Misc Expense', 'misc_expense'],
            ['Closing', 'closing_balance'],
          ].map(([label, key]) => (
            <div key={key}><dt>{label}</dt><dd className={key === 'cash_out' && toNumber(detailRow[key]) ? 'neg' : ''}>{key === 'cash_out' && toNumber(detailRow[key]) ? `−${fmt(Math.abs(toNumber(detailRow[key])), currency)}` : fmt(detailRow[key], currency)}</dd></div>
          ))}
          <div><dt>Change</dt><dd className={changeOf(detailRow) >= 0 ? 'pos' : 'neg'}>{changeOf(detailRow) >= 0 ? '+' : '−'}{fmt(Math.abs(changeOf(detailRow)), currency)}</dd></div>
          <div><dt>Recorded</dt><dd>{displayDate(detailRow.created_at, true)}</dd></div>
        </dl>
        <h3>Notes</h3><p className="detail-notes">{detailRow.notes || 'No notes for this entry.'}</p>
        <div className="detail-share-actions">
          <button type="button" className="secondary" onClick={() => exportMerchantPdf(detailRow.merchant_name)}>
            <FileText size={15} /> Merchant PDF Statement
          </button>
          <button type="button" className="secondary" onClick={() => shareMerchantWhatsApp(detailRow.merchant_name)}>
            <Share2 size={15} /> WhatsApp Summary
          </button>
        </div>
        <div className="actions detail-actions">
          <button type="button" className="secondary" onClick={() => detailAction(onCopy)}><Copy size={16} /> Copy</button>
          <button type="button" className="secondary" onClick={() => detailAction(onEdit)}><Pencil size={16} /> Edit</button>
          <button type="button" className="danger" onClick={() => detailAction(onDelete)}><Trash2 size={16} /> Delete</button>
        </div>
      </AccessibleDialog>}
    </div>
  )
}
