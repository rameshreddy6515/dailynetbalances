import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import BalanceForm from './components/BalanceForm'
import MerchantAdd from './components/MerchantAdd'
import RecordsTable from './components/RecordsTable'
import SummaryPanel from './components/SummaryPanel'
import ChartsPanel from './components/ChartsPanel'
import ConfirmDialog, { AccessibleDialog } from './components/ConfirmDialog'
import Login from './components/Login'
import CommandPalette from './components/CommandPalette'
import DashboardSettings from './components/DashboardSettings'
import Select from './components/Select'
import Switch from './components/Switch'
import CountUp from './components/CountUp'
import MerchantAvatar from './components/MerchantAvatar'
import { registerSW } from './pwa'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Search,
  UserRound,
  Command,
  Info,
  List,
  LogOut,
  Plus,
  Settings,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react'
import { changeOf, fmt, toNumber, CURRENCIES, localToday, latestWalletEntries, displayDate, setNumberLocale } from './format'

const OPTIONAL_COLS = ['entry_type', 'misc_expense']

const DEFAULT_CFG = {
  statOrder: ['wallet', 'today', 'merchants', 'entries', 'cashIn', 'misc'],
  statHidden: ['cashIn', 'misc'],
  sectionOrder: ['charts', 'leaderboard'],
  sectionHidden: [],
}
const STAT_LABELS = {
  wallet: 'Total Wallet',
  today: "Today's Change",
  merchants: 'Merchants',
  entries: 'Entries shown',
  cashIn: 'Total Cash In',
  misc: 'Total Misc Exp',
}
const SECTION_LABELS = {
  charts: 'Charts',
  leaderboard: 'Merchant leaderboard',
}
const ACCENTS = [
  { value: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg,#4f46e5,#7c3aed)' },
  { value: 'emerald', label: 'Emerald', swatch: 'linear-gradient(135deg,#059669,#10b981)' },
  { value: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg,#0ea5e9,#2563eb)' },
  { value: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg,#f97316,#ef4444)' },
  { value: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg,#ec4899,#f43f5e)' },
  { value: 'slate', label: 'Slate', swatch: 'linear-gradient(135deg,#334155,#64748b)' },
]

function ToastItem({ t, onClose, onAction }) {
  const [paused, setPaused] = useState(false)
  const remainRef = useRef(t.duration)
  const endRef = useRef(0)

  useEffect(() => {
    if (paused) {
      remainRef.current = Math.max(0, endRef.current - Date.now())
      return
    }
    endRef.current = Date.now() + remainRef.current
    const id = setTimeout(onClose, remainRef.current)
    return () => clearTimeout(id)
  }, [paused])

  return (
    <div
      className={`toast toast-${t.type}`}
      role={t.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={(e) => { if (!e.currentTarget.contains(document.activeElement)) setPaused(false) }}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget) && !e.currentTarget.matches(':hover')) setPaused(false) }}
    >
      {t.type === 'success' ? (
        <CheckCircle2 size={16} />
      ) : t.type === 'error' ? (
        <AlertTriangle size={16} />
      ) : (
        <Info size={16} />
      )}
      <span>{t.text}</span>
      {t.action && (
        <button type="button" className="small primary" onClick={onAction}>
          {t.action.label}
        </button>
      )}
      <button type="button" className="toast-close" data-tip="Dismiss" aria-label="Dismiss" onClick={onClose}>
        <X size={14} />
      </button>
      <div
        className="toast-bar"
        style={{ animationDuration: `${t.duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  )
}

export default function App() {
  const [merchants, setMerchants] = useState([])
  const [initialBalances, setInitialBalances] = useState({})
  const [records, setRecords] = useState([])
  const [walletRows, setWalletRows] = useState([])
  const [walletOpen, setWalletOpen] = useState(false)
  const [walletLoading, setWalletLoading] = useState(true)
  const [walletError, setWalletError] = useState('')
  const walletRequest = useRef(0)
  const [filters, setFilters] = useState({ merchant: '', from: '', to: '' })
  const [editingRow, setEditingRow] = useState(null)
  const [selectMerchant, setSelectMerchant] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system')
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [currency, setCurrency] = useState(() => localStorage.getItem('currency') || '₹')
  const [indianFmt, setIndianFmt] = useState(() => {
    const v = localStorage.getItem('numfmt') !== 'us'
    setNumberLocale(v ? 'en-IN' : 'en-US')
    return v
  })
  const [accent, setAccent] = useState(() => localStorage.getItem('accent') || 'indigo')
  const [copySource, setCopySource] = useState(null)
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const [showMerchants, setShowMerchants] = useState(false)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dashOpen, setDashOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryBusy, setEntryBusy] = useState(false)
  const [entryKey, setEntryKey] = useState(0)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const entryRef = useRef(null)
  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? records.filter((r) => `${r.merchant_name || ''} ${r.notes || ''} ${r.balance_date || ''}`.toLowerCase().includes(term)) : records
  }, [records, search])
  const [dashCfg, setDashCfg] = useState(() => {
    try {
      return { ...DEFAULT_CFG, ...(JSON.parse(localStorage.getItem('dashConfig.records.v1')) || {}) }
    } catch {
      return DEFAULT_CFG
    }
  })

  useEffect(() => {
    localStorage.setItem('dashConfig.records.v1', JSON.stringify(dashCfg))
  }, [dashCfg])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setEntryOpen(false); setWalletOpen(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const h = (e) => {
      if (document.querySelector('dialog[open]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    if (!entryOpen) return
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    entryRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [entryOpen])

  useEffect(() => {
    if (!entryOpen || confirmState || paletteOpen || showMerchants || dashOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (entryRef.current?.querySelector('.select-panel, .dp-panel')) return
        e.preventDefault()
        if (!entryBusy) setEntryOpen(false)
      }
      if (e.key !== 'Tab') return
      const items = [...entryRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((el) => el.getClientRects().length)
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === entryRef.current)) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [entryOpen, entryBusy, confirmState, paletteOpen, showMerchants, dashOpen])

  const newEntry = (merchant = '') => {
    if (entryBusy) return
    setEntryKey((k) => k + 1)
    setEditingRow(null)
    setCopySource(null)
    setSelectMerchant(merchant)
    setEntryOpen(true)
  }
  const editRecord = (row) => {
    setEntryKey((k) => k + 1)
    setCopySource(null)
    setSelectMerchant('')
    setEditingRow(row)
    setEntryOpen(true)
  }
  const closeEntry = () => {
    if (!entryBusy) setEntryOpen(false)
  }

  useEffect(() => {
    const closeMenus = (e) => {
      document.querySelectorAll('.menu-wrap[open]').forEach((menu) => {
        if (e.type === 'keydown') {
          if (e.key !== 'Escape') return
          menu.removeAttribute('open')
          menu.querySelector('summary')?.focus()
        } else if (!menu.contains(e.target) || e.target.closest('button')) {
          menu.removeAttribute('open')
        }
      })
    }
    document.addEventListener('click', closeMenus)
    document.addEventListener('keydown', closeMenus)
    return () => {
      document.removeEventListener('click', closeMenus)
      document.removeEventListener('keydown', closeMenus)
    }
  }, [])

  const notify = (text, type = 'info', action = null) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, type, action, duration: action ? 7000 : 4500 }])
  }
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id))

  const askConfirm = (message, options = {}) =>
    new Promise((resolve) => setConfirmState({ message, resolve, ...options }))

  const closeConfirm = (answer) => {
    confirmState?.resolve(answer)
    setConfirmState(null)
  }

  useEffect(() => {
    localStorage.setItem('currency', currency)
  }, [currency])
  const [reminder, setReminder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('reminderSettings')) || { enabled: false, time: '21:00' }
    } catch {
      return { enabled: false, time: '21:00' }
    }
  })

  useEffect(() => {
    localStorage.setItem('reminderSettings', JSON.stringify(reminder))
  }, [reminder])

  useEffect(() => {
    if (!reminder.enabled) return
    const check = async () => {
      const todayStr = localToday()
      const now = new Date()
      const [h, m] = reminder.time.split(':').map(Number)
      if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return
      if (localStorage.getItem('lastReminderDate') === todayStr) return
      if (!supabase || !session || Notification.permission !== 'granted') return

      const { count } = await supabase
        .from('daily_balances')
        .select('id', { count: 'exact', head: true })
        .eq('balance_date', todayStr)
      localStorage.setItem('lastReminderDate', todayStr)
      if ((count || 0) === 0) {
        new Notification('Merchant Daily Balance', {
          body: `No balance entry saved for today (${todayStr}) yet.`,
        })
      }
    }
    const id = setInterval(check, 60000)
    check()
    return () => clearInterval(id)
  }, [reminder, session])

  const toggleReminder = async (enabled) => {
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus({ type: 'error', text: 'Notification permission was denied.' })
        return
      }
    }
    setReminder((r) => ({ ...r, enabled }))
  }

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSysDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const dark = theme === 'dark' || (theme === 'system' && sysDark)

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : ''
    localStorage.setItem('theme', theme)
  }, [dark, theme])

  useEffect(() => {
    setNumberLocale(indianFmt ? 'en-IN' : 'en-US')
    localStorage.setItem('numfmt', indianFmt ? 'in' : 'us')
  }, [indianFmt])

  useEffect(() => {
    document.documentElement.dataset.accent = accent === 'indigo' ? '' : accent
    localStorage.setItem('accent', accent)
  }, [accent])

  useEffect(() => {
    registerSW((activate) =>
      notify('A new version of the app is available.', 'info', { label: 'Refresh', fn: activate })
    )
  }, [])

  const loadMerchants = useCallback(async () => {
    if (!supabase || !session) return
    let { data, error } = await supabase
      .from('merchants')
      .select('merchant_name, initial_balance')
      .order('merchant_name', { ascending: true })
    if (error && (error.message || '').includes('initial_balance')) {
      ;({ data, error } = await supabase
        .from('merchants')
        .select('merchant_name')
        .order('merchant_name', { ascending: true }))
    }
    if (error) {
      setStatus({ type: 'error', text: error.message })
    } else {
      setMerchants((data || []).map((r) => r.merchant_name).filter(Boolean))
      const map = {}
      for (const r of data || []) {
        if (r.merchant_name) map[r.merchant_name] = Number(r.initial_balance) || 0
      }
      setInitialBalances(map)
    }
  }, [session])

  const loadRecords = useCallback(async (f) => {
    if (!supabase || !session) {
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from('daily_balances')
      .select('*')
      .order('balance_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (f.merchant) query = query.eq('merchant_name', f.merchant)
    if (f.from) query = query.gte('balance_date', f.from)
    if (f.to) query = query.lte('balance_date', f.to)
    const { data, error } = await query
    if (error) setStatus({ type: 'error', text: error.message })
    else setRecords(data || [])
    setLoading(false)
  }, [session])

  const loadWallet = useCallback(async () => {
    if (!supabase || !session) {
      walletRequest.current += 1
      setWalletRows([])
      setWalletLoading(false)
      return
    }
    const request = ++walletRequest.current
    setWalletLoading(true)
    setWalletError('')
    try {
      const rows = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('daily_balances')
          .select('id, merchant_name, balance_date, created_at, opening_balance, cash_in, cash_out, misc_expense, closing_balance')
          .order('balance_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 999)
        if (request !== walletRequest.current) return
        if (error) throw error
        rows.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      setWalletRows(rows)
    } catch {
      if (request === walletRequest.current) setWalletError('Could not refresh wallet balances. Please retry; any amounts shown are from the previous load.')
    } finally {
      if (request === walletRequest.current) setWalletLoading(false)
    }
  }, [session])

  useEffect(() => {
    loadMerchants()
    loadWallet()
  }, [loadMerchants, loadWallet])

  useEffect(() => {
    loadRecords(filters)
  }, [filters, loadRecords])

  const addMerchant = async (rawName, startBal = 0) => {
    const merchantName = rawName.trim()
    if (!merchantName) {
      setStatus({ type: 'error', text: 'Enter a merchant name first.' })
      return false
    }
    const existing = merchants.find((m) => m.toLowerCase() === merchantName.toLowerCase())
    if (existing) {
      setSelectMerchant(existing)
      setStatus({ type: 'info', text: `Merchant "${existing}" is already in the list.` })
      notify(`Merchant "${existing}" already exists — cannot add a duplicate.`, 'error')
      return false
    }

    const initialBal = toNumber(startBal)
    setMerchants((prev) => [...prev, merchantName].sort((a, b) => a.localeCompare(b)))
    setInitialBalances((m) => ({ ...m, [merchantName]: initialBal }))
    setSelectMerchant(merchantName)
    setStatus({ type: 'info', text: `Merchant "${merchantName}" added to the list.` })

    if (!supabase) {
      notify(`Merchant "${merchantName}" added.`, 'success')
      return true
    }
    let { error } = await supabase
      .from('merchants')
      .insert({ merchant_name: merchantName, initial_balance: initialBal })
    if (error && (error.message || '').includes('initial_balance')) {
      ;({ error } = await supabase.from('merchants').insert({ merchant_name: merchantName }))
      if (!error) {
        notify(`Merchant saved, but starting balance was not stored — run the updated supabase.sql.`, 'info')
      }
    }
    if (error) {
      setStatus({ type: 'error', text: `Added to the list, but could not save to Supabase: ${error.message}` })
      notify(`Added to the list, but could not save to Supabase: ${error.message}`, 'error')
    } else {
      notify(`Merchant "${merchantName}" added and saved.`, 'success')
    }
    return true
  }

  const setMerchantStart = async (name, value) => {
    if (!name) {
      setStatus({ type: 'error', text: 'Pick a merchant to set a starting balance.' })
      return false
    }
    const bal = toNumber(value)
    if (!supabase) {
      setInitialBalances((m) => ({ ...m, [name]: bal }))
      notify(`Starting balance for "${name}" set to ${fmt(bal, currency)}.`, 'success')
      return true
    }
    const { error } = await supabase
      .from('merchants')
      .update({ initial_balance: bal })
      .eq('merchant_name', name)
    if (error) {
      const msg = (error.message || '').includes('initial_balance')
        ? `${error.message} — run the updated supabase.sql to enable starting balances.`
        : error.message
      notify(`Could not set starting balance: ${msg}`, 'error')
      return false
    }
    setInitialBalances((m) => ({ ...m, [name]: bal }))
    notify(`Starting balance for "${name}" set to ${fmt(bal, currency)}.`, 'success')
    return true
  }

  const deleteMerchant = async (name) => {
    if (!name) {
      setStatus({ type: 'error', text: 'Pick a merchant to delete.' })
      return false
    }
    const ok = await askConfirm(`Delete merchant "${name}"? Their saved balance records will be kept.`, {
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return false
    if (!supabase) return false

    const { error } = await supabase.from('merchants').delete().eq('merchant_name', name)
    if (error) {
      setStatus({ type: 'error', text: error.message })
      notify(`Could not delete merchant: ${error.message}`, 'error')
      return false
    }

    setMerchants((prev) => prev.filter((m) => m !== name))
    if (selectMerchant === name) setSelectMerchant('')
    if (filters.merchant === name) {
      setFilters((f) => ({ ...f, merchant: '' }))
    }
    setStatus({ type: 'success', text: `Merchant "${name}" deleted.` })
    notify(`Merchant "${name}" deleted.`, 'success', {
      label: 'Undo',
      fn: () => restoreMerchant(name, initialBalances[name] || 0),
    })
    return true
  }

  const restoreMerchant = async (name, bal) => {
    if (!supabase) return
    const { error } = await supabase
      .from('merchants')
      .upsert({ merchant_name: name, initial_balance: bal }, { onConflict: 'merchant_name' })
    if (error) {
      notify(`Could not restore merchant: ${error.message}`, 'error')
      return
    }
    notify(`Merchant "${name}" restored.`, 'success')
    await loadMerchants()
  }

  const renameMerchant = async (oldName, rawNewName) => {
    const newName = rawNewName.trim()
    if (!oldName || !newName) {
      setStatus({ type: 'error', text: 'Pick a merchant and enter a new name.' })
      return false
    }
    if (merchants.some((m) => m.toLowerCase() === newName.toLowerCase())) {
      setStatus({ type: 'error', text: `"${newName}" already exists.` })
      notify(`"${newName}" already exists — cannot rename to a duplicate.`, 'error')
      return false
    }
    if (!supabase) return false
    const okRename = await askConfirm(`Rename "${oldName}" to "${newName}"? All saved records will be updated.`)
    if (!okRename) return false

    const { error: err1 } = await supabase
      .from('merchants')
      .update({ merchant_name: newName })
      .eq('merchant_name', oldName)
    const { error: err2 } = await supabase
      .from('daily_balances')
      .update({ merchant_name: newName })
      .eq('merchant_name', oldName)
    const err = err1 || err2
    if (err) {
      setStatus({ type: 'error', text: err.message })
      notify(`Could not rename: ${err.message}`, 'error')
      return false
    }

    setMerchants((prev) => prev.map((m) => (m === oldName ? newName : m)).sort((a, b) => a.localeCompare(b)))
    if (selectMerchant === oldName) setSelectMerchant(newName)
    if (filters.merchant === oldName) {
      setFilters((f) => ({ ...f, merchant: newName }))
    } else {
      await loadRecords(filters)
    }
    setStatus({ type: 'success', text: `Renamed "${oldName}" to "${newName}".` })
    notify(`Renamed "${oldName}" to "${newName}".`, 'success')
    return true
  }

  const saveRecord = async (payload, editingId) => {
    if (!payload.merchant_name || !payload.balance_date) {
      setStatus({ type: 'error', text: 'Merchant name and date are required.' })
      return false
    }
    if (!supabase) {
      setStatus({ type: 'error', text: 'Supabase is not configured. Check the .env file.' })
      return false
    }

    const write = (p) =>
      editingId
        ? supabase.from('daily_balances').update(p).eq('id', editingId)
        : supabase.from('daily_balances').insert(p)

    const dropped = []
    let result = await write(payload)
    for (const col of OPTIONAL_COLS) {
      if (result.error && (result.error.message || '').includes(col)) {
        dropped.push(col)
        delete payload[col]
        result = await write(payload)
      }
    }

    if (result.error) {
      setStatus({ type: 'error', text: result.error.message })
      notify(`Could not save: ${result.error.message}`, 'error')
      return false
    }

    const saved = editingId ? 'Row updated.' : 'Saved successfully.'
    const savedText = dropped.length
      ? `${saved} Note: run the updated supabase.sql so ${dropped.join(' and ')} ${dropped.length === 1 ? 'is' : 'are'} stored.`
      : saved
    setStatus({ type: 'success', text: savedText })
    notify(savedText, 'success')
    navigator.vibrate?.(40)
    setEntryOpen(false)
    setEditingRow(null)
    setCopySource(null)
    await loadRecords(filters)
    await loadWallet()
    return true
  }

  const deleteRecord = async (row) => {
    if (!supabase) return
    const ok = await askConfirm(`Delete the record for ${row.merchant_name} on ${row.balance_date}?`, {
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('daily_balances').delete().eq('id', row.id)
    if (error) {
      setStatus({ type: 'error', text: error.message })
      notify(`Could not delete: ${error.message}`, 'error')
      return
    }
    if (editingRow?.id === row.id) setEditingRow(null)
    setStatus({ type: 'success', text: 'Row deleted.' })
    notify('Row deleted.', 'success', { label: 'Undo', fn: () => restoreRow(row) })
    await loadRecords(filters)
    await loadWallet()
  }

  const restoreRow = async (row) => {
    const { id, created_at, ...rest } = row
    const { error } = await supabase.from('daily_balances').insert(rest)
    if (error) {
      setStatus({ type: 'error', text: `Could not restore: ${error.message}` })
      notify(`Could not restore: ${error.message}`, 'error')
      return
    }
    setStatus({ type: 'success', text: 'Row restored.' })
    notify('Row restored.', 'success')
    await loadRecords(filters)
    await loadWallet()
  }

  const backupData = async () => {
    if (!supabase) return
    const [bal, merch] = await Promise.all([
      supabase.from('daily_balances').select('*').order('balance_date'),
      supabase.from('merchants').select('*').order('merchant_name'),
    ])
    if (bal.error || merch.error) {
      notify(`Backup failed: ${(bal.error || merch.error).message}`, 'error')
      return
    }
    const payload = { exported_at: new Date().toISOString(), merchants: merch.data, daily_balances: bal.data }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balance-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify(`Backup downloaded (${bal.data.length} records, ${merch.data.length} merchants).`, 'success')
  }

  const restoreData = async (file) => {
    if (!file || !supabase) return
    setRestoring(true)
    let data
    try {
      data = JSON.parse(await file.text())
    } catch {
      notify('Invalid backup file — could not read JSON.', 'error')
      setRestoring(false)
      return
    }
    const balances = data.daily_balances || []
    const merchantsData = (data.merchants || []).map((m) => ({ merchant_name: m.merchant_name })).filter((m) => m.merchant_name)
    const okRestore = await askConfirm(
      `Restore ${balances.length} records and ${merchantsData.length} merchants? Existing rows with the same ID will be updated.`,
      { confirmLabel: 'Restore' }
    )
    if (!okRestore) {
      setRestoring(false)
      return
    }
    if (merchantsData.length) {
      await supabase.from('merchants').upsert(merchantsData, { onConflict: 'merchant_name', ignoreDuplicates: true })
    }
    const { error } = balances.length
      ? await supabase.from('daily_balances').upsert(balances, { onConflict: 'id' })
      : { error: null }
    if (error) {
      notify(`Restore failed: ${error.message}`, 'error')
      setRestoring(false)
      return
    }
    setStatus({ type: 'success', text: `Restored ${balances.length} records.` })
    notify(`Restore complete — ${balances.length} records.`, 'success')
    await loadMerchants()
    await loadRecords(filters)
    await loadWallet()
    setRestoring(false)
  }

  const copyRecord = (row) => {
    setEntryKey((k) => k + 1)
    setEditingRow(null)
    setSelectMerchant('')
    setCopySource({ ...row, _tick: Date.now() })
    setEntryOpen(true)
  }

  const wallet = useMemo(() => {
    const entries = latestWalletEntries(walletRows)
    const todayStr = localToday()
    const todayChange = walletRows.reduce((total, row) => total + (row.balance_date === todayStr ? changeOf(row) : 0), 0)
    const total = entries.reduce((sum, row) => sum + Math.round(toNumber(row.closing_balance) * 100), 0) / 100
    return { total, todayChange, entries }
  }, [walletRows])

  const stats = useMemo(
    () => ({
      merchants: merchants.length,
      entries: visibleRecords.length,
      cashIn: visibleRecords.reduce((t, r) => t + toNumber(r.cash_in), 0),
      misc: visibleRecords.reduce((t, r) => t + toNumber(r.misc_expense), 0),
    }),
    [visibleRecords, merchants]
  )

  const go = (id) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const pullRef = useRef({ active: false, y: 0 })
  const [pullDist, setPullDist] = useState(0)
  const onPullStart = (e) => {
    if (!entryOpen && window.scrollY === 0 && !e.target.closest('button, input, textarea, .modal-overlay')) pullRef.current = { active: true, y: e.touches[0].clientY }
  }
  const onPullMove = (e) => {
    if (!pullRef.current.active || window.scrollY > 0) return
    const d = e.touches[0].clientY - pullRef.current.y
    setPullDist(d > 0 ? Math.min(d, 140) : 0)
  }
  const onPullEnd = () => {
    if (pullDist > 80) loadRecords(filters)
    pullRef.current.active = false
    setPullDist(0)
  }

  const commands = (() => {
    return [
      { group: 'Merchant', label: 'Open merchant settings', run: () => setShowMerchants(true) },
      ...merchants.map((m) => ({
        group: 'Merchant',
        label: `New entry — ${m}`,
        run: () => newEntry(m),
      })),
      { group: 'Go to', label: 'New entry', run: () => newEntry() },
      { group: 'Go to', label: 'Analytics', run: () => { setAnalyticsOpen(true); go('analytics')() } },
      { group: 'Go to', label: 'Saved balances table', run: go('records') },
      { group: 'Action', label: 'Refresh records', run: () => loadRecords(filters) },
      { group: 'Action', label: 'Customize dashboard', run: () => setDashOpen(true) },
      { group: 'Action', label: 'Toggle dark mode', run: () => setTheme(dark ? 'light' : 'dark') },
      { group: 'Action', label: 'Print records', run: () => window.print() },
      ...(session && supabase
        ? [{ group: 'Action', label: 'Sign out', run: () => supabase.auth.signOut() }]
        : []),
    ]
  })()

  const moneyFmt = (v) => fmt(v, currency)
  const showSkel = loading && records.length === 0
  const statDefs = {
    wallet: { cls: 'stat-wallet', value: wallet.total, format: moneyFmt, lbl: 'Total Wallet' },
    today: {
      cls: 'stat-today',
      value: wallet.todayChange,
      format: (v) => `${v >= 0 ? '+' : ''}${fmt(v, currency)}`,
      lbl: "Today's Change",
    },
    merchants: { cls: 'stat-1', value: stats.merchants, format: (v) => Math.round(v), lbl: 'Merchants' },
    entries: { cls: 'stat-2', value: stats.entries, format: (v) => Math.round(v), lbl: 'Entries shown' },
    cashIn: { cls: 'stat-3', value: stats.cashIn, format: moneyFmt, lbl: 'Total Cash In' },
    misc: { cls: 'stat-4', value: stats.misc, format: moneyFmt, lbl: 'Total Misc Exp' },
  }

  const sectionNodes = {
    charts: (
      <div key="charts" id="charts">
        <ChartsPanel records={visibleRecords} currency={currency} loading={loading} />
      </div>
    ),
    leaderboard: (
      <div key="leaderboard" id="leaderboard">
        <SummaryPanel records={visibleRecords} currency={currency} />
      </div>
    ),
    records: (
      <div key="records" id="records">
        <div className="print-header">
          <h2>Merchant Daily Balance</h2>
          <div>
            {filters.merchant || 'All merchants'} — {filters.from || '…'} to {filters.to || '…'}
          </div>
          <div className="print-meta">Generated {new Date().toLocaleString()}</div>
        </div>
        <RecordsTable
          records={visibleRecords}
          loading={loading}
          filters={filters}
          merchants={merchants}
          currency={currency}
          onFiltersChange={setFilters}
          onRefresh={() => loadRecords(filters)}
          onEdit={editRecord}
          search={search}
          onSearchChange={setSearch}
          onDelete={deleteRecord}
          onCopy={copyRecord}
          onBackup={backupData}
          onRestoreFile={restoreData}
          restoring={restoring}
        />
      </div>
    ),
  }

  if (supabase && !authReady) {
    return (
      <div className="wrap">
        <div className="card">
          <p>Loading…</p>
        </div>
      </div>
    )
  }
  if (supabase && !session) return <Login />

  return (
    <div className="wrap" onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd}>
      {pullDist > 30 && (
        <div className="ptr-bar no-print">
          {pullDist > 80 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      <div className="card workspace" inert={entryOpen ? true : undefined}>
        <div className="topbar no-print">
          <div className="brand">
            <h1>Merchant Daily Balance</h1>
            <p className="brand-sub">
              Track opening balance, cash in/out, miscellaneous expense, and the end-of-day wallet
              amount per merchant.
            </p>
          </div>
          <div className="header-controls">
          <div className="actions header-primary">
            <button
              type="button"
              className="secondary small"
              onClick={() => setShowMerchants(true)}
              data-tip="Merchant settings"
            >
              <Settings size={14} /> Merchants
            </button>
            <button
              type="button"
              className="secondary small"
              onClick={() => setPaletteOpen(true)}
              data-tip="Command palette (Ctrl+K)"
            >
              <Command size={14} /> K
            </button>
            <button
              type="button"
              className="secondary small"
              onClick={() => setDashOpen(true)}
              data-tip="Customize dashboard"
            >
              <SlidersHorizontal size={14} /> Customize
            </button>
            {session && (
              <details className="menu-wrap account-menu">
                <summary className="secondary"><UserRound size={16} /> Account <ChevronDown size={14} /></summary>
                <div className="menu-panel">
                  <span className="account-email">{session.user?.email}</span>
                  <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </details>
            )}
          </div>
          <div className="actions header-preferences">
            <div className="reminder-group">
              <Switch checked={reminder.enabled} onChange={toggleReminder} label="Remind me at" />
              <input type="time" className="time-input" aria-label="Reminder time" value={reminder.time}
                onChange={(e) => setReminder((r) => ({ ...r, time: e.target.value }))} disabled={!reminder.enabled} />
            </div>
            <Select label="Currency symbol" className="mini currency-sel" options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={currency} onChange={setCurrency} />
            <Select label="Number format" className="mini numfmt-sel"
              options={[{ value: 'in', label: '1,25,000' }, { value: 'us', label: '125,000' }]}
              value={indianFmt ? 'in' : 'us'} onChange={(v) => setIndianFmt(v === 'in')} />
            <Select label="Theme" className="mini theme-sel"
              options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
              value={theme} onChange={setTheme} />
            <Select label="Accent color" className="mini accent-sel"
              options={ACCENTS.map((a) => ({ value: a.value, label: a.label, node: <span className="merchant-cell"><span className="accent-dot" style={{ background: a.swatch }} />{a.label}</span> }))}
              value={accent} onChange={setAccent} />
          </div>
          </div>
        </div>

        <div className="stats no-print">
          {showSkel
            ? dashCfg.statOrder
                .filter((k) => statDefs[k] && !dashCfg.statHidden.includes(k))
                .map((k) => (
                  <div key={k} className="stat">
                    <div className="skel skel-num" />
                    <div className="skel skel-lbl" />
                  </div>
                ))
            : dashCfg.statOrder
                .filter((k) => statDefs[k] && !dashCfg.statHidden.includes(k))
                .map((k) => k === 'wallet' ? (
                  <button key={k} type="button" className="stat stat-wallet wallet-trigger" aria-haspopup="dialog"
                    aria-label={`Total wallet ${fmt(wallet.total, currency)}. View merchant breakdown`} onClick={() => setWalletOpen(true)}>
                    <span className="num">{walletLoading ? 'Loading…' : <CountUp value={wallet.total} format={moneyFmt} />}</span>
                    <span className="lbl">Total Wallet</span>
                    <span className="stat-link">{walletError ? 'Refresh failed — view details' : 'View breakdown'}</span>
                  </button>
                ) : (
                  <div key={k} className={`stat ${statDefs[k].cls}`}>
                    <div className="num"><CountUp value={statDefs[k].value} format={statDefs[k].format} /></div>
                    <div className="lbl">{statDefs[k].lbl}</div>
                  </div>
                ))}
        </div>

        {status && <div className={`message ${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.text}</div>}
        <div className="workspace-actions no-print">
          <button type="button" className="primary" onClick={() => newEntry()}><Plus size={18} /> New Entry</button>
          <label className="record-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Search loaded records by merchant, notes, or date" placeholder="Search records" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        {sectionNodes.records}
        <section id="analytics" className="workspace-section no-print">
          <div className="sec-head">
            <h2>Analytics</h2>
            <button type="button" className="secondary" aria-expanded={analyticsOpen} aria-controls="analytics-content" onClick={() => setAnalyticsOpen((o) => !o)}>
              {analyticsOpen ? 'Collapse' : 'Expand'} <ChevronDown size={16} />
            </button>
          </div>
          {analyticsOpen && <div id="analytics-content">
            {dashCfg.sectionOrder.map((k) => sectionNodes[k] && !dashCfg.sectionHidden.includes(k) && sectionNodes[k])}
            {!loading && !visibleRecords.length && <p>No records match this view. Adjust the filters to see analytics.</p>}
          </div>}
        </section>
      </div>

      <div className="toast-stack no-print">
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            t={t}
            onClose={() => dismissToast(t.id)}
            onAction={() => {
              t.action?.fn()
              dismissToast(t.id)
            }}
          />
        ))}
      </div>

      {walletOpen && (
        <AccessibleDialog title="Wallet breakdown" className="wallet-dialog" onClose={() => setWalletOpen(false)}>
          <p>Each merchant’s latest recorded closing balance. Table filters do not affect this total.</p>
          {walletLoading && <p role="status">Loading wallet balances…</p>}
          {walletError && <div role="alert" className="message error">{walletError}</div>}
          <button type="button" className="secondary" disabled={walletLoading} onClick={loadWallet}>Refresh wallet</button>
          <ul className="wallet-list" aria-label="Merchant wallet balances">
            {wallet.entries.map((row) => (
              <li key={row.merchant_name}>
                <div className="wallet-item">
                  <MerchantAvatar name={row.merchant_name} />
                  <div><strong>{row.merchant_name}</strong>
                    <span>Balance date: {displayDate(row.balance_date)}</span>
                    <span>Recorded: {displayDate(row.created_at, true)}</span>
                  </div>
                </div>
                <b>{fmt(row.closing_balance, currency)}</b>
              </li>
            ))}
          </ul>
          {!walletLoading && !walletError && !wallet.entries.length && <p>No saved closing balances yet.</p>}
          {merchants.filter((m) => !wallet.entries.some((r) => r.merchant_name === m)).length > 0 && (
            <p className="wallet-note">No saved closing balance (not included): {merchants.filter((m) => !wallet.entries.some((r) => r.merchant_name === m)).join(', ')}.</p>
          )}
          <p className="wallet-note">Recorded time is when the entry was created, not when it was last edited.</p>
          <div className="wallet-total"><span>Total Wallet</span><strong>{fmt(wallet.total, currency)}</strong></div>
        </AccessibleDialog>
      )}

      {showMerchants && (
        <AccessibleDialog title="Merchant Settings" onClose={() => setShowMerchants(false)}>
            <MerchantAdd
              merchants={merchants}
              balances={initialBalances}
              onAdd={addMerchant}
              onRename={renameMerchant}
              onDelete={deleteMerchant}
              onSetStart={setMerchantStart}
            />
        </AccessibleDialog>
      )}

      <div className="entry-overlay no-print" hidden={!entryOpen} onClick={(e) => { if (e.target === e.currentTarget) closeEntry() }}>
        <aside className="entry-panel" ref={entryRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="entry-title">
          <div className="entry-panel-head">
            <div><h2 id="entry-title">{editingRow ? 'Edit entry' : copySource ? 'Copy entry' : 'New entry'}</h2><p>Record the actual closing balance for this merchant.</p></div>
            <button type="button" className="secondary icon-button" aria-label="Close entry panel" disabled={entryBusy} onClick={closeEntry}><X size={20} /></button>
          </div>
          <BalanceForm key={entryKey} merchants={merchants} initialBalances={initialBalances} editingRow={editingRow}
            selectMerchant={selectMerchant} copySource={copySource} currency={currency}
            onSubmit={saveRecord} onConfirm={askConfirm} onCancelEdit={() => setEditingRow(null)}
            onClose={closeEntry} onBusyChange={setEntryBusy} />
        </aside>
      </div>

      <nav className="bottom-nav no-print" inert={entryOpen ? true : undefined}>
        <button type="button" onClick={go('records')} aria-label="Records">
          <List size={19} />
          <span>Records</span>
        </button>
        <button
          type="button"
          className="bn-main"
          aria-label="New entry"
          onClick={() => newEntry()}
        >
          <Plus size={22} />
          <span>New</span>
        </button>
        <button type="button" onClick={() => setShowMerchants(true)} aria-label="Merchants">
          <Store size={19} />
          <span>Merchants</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <DashboardSettings
        open={dashOpen}
        cfg={dashCfg}
        statLabels={STAT_LABELS}
        sectionLabels={SECTION_LABELS}
        onChange={setDashCfg}
        onReset={() => setDashCfg(DEFAULT_CFG)}
        onClose={() => setDashOpen(false)}
      />

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onAnswer={closeConfirm}
        />
      )}
    </div>
  )
}
