import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import BalanceForm from './components/BalanceForm'
import MerchantAdd from './components/MerchantAdd'
import RecordsTable from './components/RecordsTable'
import ReconPanel from './components/ReconPanel'
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
import CalcPad from './components/CalcPad'
import ChargeCalc from './components/ChargeCalc'
import { DEFAULT_PCTS, DEFAULT_TYPES } from './chargeData'
import ChargeTypes from './components/ChargeTypes'
import PresetRates from './components/PresetRates'
import pkg from '../package.json'
import { registerSW } from './pwa'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calculator,
  CheckCircle2,
  ChevronDown,
  FileText,
  Receipt,
  Search,
  TrendingUp,
  Command,
  Download,
  Info,
  Landmark,
  List,
  ListOrdered,
  LogOut,
  Moon,
  Percent,
  Plus,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Store,
  Sun,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import { changeOf, fmt, toNumber, CURRENCIES, localToday, localDay, latestWalletEntries, displayDate, setNumberLocale, setDateFormat } from './format'

const OPTIONAL_COLS = ['entry_type', 'misc_expense', 'bank_amount', 'tags']
const TODAY_LABEL = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

const DEFAULT_CFG = {
  statOrder: ['wallet', 'today', 'merchants', 'entries', 'bank', 'misc'],
  statHidden: ['misc', 'entries'],
  sectionOrder: ['charts', 'leaderboard', 'recon'],
  sectionHidden: [],
}
const DEFAULT_ACCOUNT_PREFERENCES = {
  theme: 'system',
  currency: '₹',
  indianFmt: true,
  dateFmt: 'dmy',
  density: 'comfortable',
  accent: 'indigo',
  chargeTypes: DEFAULT_TYPES,
  chargePresets: DEFAULT_PCTS,
  reminder: { enabled: false, time: '21:00' },
  dashConfig: DEFAULT_CFG,
}
const ACCOUNT_PREFERENCES_MIGRATION_KEY = 'accountPreferences.migratedUser.v1'

function normalizeDashboardConfig(value, fallback = DEFAULT_CFG) {
  const source = value && typeof value === 'object' ? value : {}
  const normalizeOrder = (key, defaults) => {
    const supplied = Array.isArray(source[key]) ? source[key] : fallback[key]
    const allowed = new Set(defaults)
    const order = supplied
      .map((item) => (item === 'cashIn' ? 'bank' : item))
      .filter((item, index, list) => allowed.has(item) && list.indexOf(item) === index)
    return [...order, ...defaults.filter((item) => !order.includes(item))]
  }
  const normalizeHidden = (key, orderKey, defaultHidden) => {
    const supplied = Array.isArray(source[key]) ? source[key] : defaultHidden
    return [...new Set(supplied.map((item) => (item === 'cashIn' ? 'bank' : item))
      .filter((item) => fallback[orderKey].includes(item)))]
  }
  return {
    statOrder: normalizeOrder('statOrder', fallback.statOrder),
    statHidden: normalizeHidden('statHidden', 'statOrder', fallback.statHidden),
    sectionOrder: normalizeOrder('sectionOrder', fallback.sectionOrder),
    sectionHidden: normalizeHidden('sectionHidden', 'sectionOrder', fallback.sectionHidden),
  }
}

function normalizeAccountPreferences(value, fallback = DEFAULT_ACCOUNT_PREFERENCES) {
  const source = value && typeof value === 'object' ? value : {}
  const allowedThemes = ['system', 'light', 'dark', 'black']
  const allowedDateFormats = ['dmy', 'mdy', 'iso']
  const allowedDensities = ['comfortable', 'compact']
  const allowedAccents = ACCENTS.map(({ value: accent }) => accent)
  const validReminderTime = (time) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const validChargeTypes = (types) => Array.isArray(types) && types.every((type) =>
    Array.isArray(type) && typeof type[0] === 'string' && Number.isFinite(Number(type[1])))
  const validChargePresets = (presets) => Array.isArray(presets) && presets.length > 0 &&
    presets.every((preset) => Number.isFinite(Number(preset)))
  const reminder = source.reminder && typeof source.reminder === 'object' ? source.reminder : {}

  return {
    theme: allowedThemes.includes(source.theme) ? source.theme : fallback.theme,
    currency: CURRENCIES.includes(source.currency) ? source.currency : fallback.currency,
    indianFmt: typeof source.indianFmt === 'boolean' ? source.indianFmt : fallback.indianFmt,
    dateFmt: allowedDateFormats.includes(source.dateFmt) ? source.dateFmt : fallback.dateFmt,
    density: allowedDensities.includes(source.density) ? source.density : fallback.density,
    accent: allowedAccents.includes(source.accent) ? source.accent : fallback.accent,
    chargeTypes: validChargeTypes(source.chargeTypes) ? source.chargeTypes : fallback.chargeTypes,
    chargePresets: validChargePresets(source.chargePresets) ? source.chargePresets : fallback.chargePresets,
    reminder: {
      enabled: typeof reminder.enabled === 'boolean' ? reminder.enabled : fallback.reminder.enabled,
      time: validReminderTime(reminder.time) ? reminder.time : fallback.reminder.time,
    },
    dashConfig: normalizeDashboardConfig(source.dashConfig, fallback.dashConfig),
  }
}
const STAT_LABELS = {
  wallet: 'Total Wallet',
  today: "Today's Change",
  merchants: 'Merchants',
  entries: 'Entries shown',
  bank: 'Moved to Bank',
  misc: 'Total Misc Exp',
}
const SECTION_LABELS = {
  charts: 'Charts',
  leaderboard: 'Merchant leaderboard',
  recon: 'Reconciliation',
}
const ACCENTS = [
  { value: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg,#4f46e5,#7c3aed)' },
  { value: 'emerald', label: 'Emerald', swatch: 'linear-gradient(135deg,#059669,#10b981)' },
  { value: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg,#0ea5e9,#2563eb)' },
  { value: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg,#f97316,#ef4444)' },
  { value: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg,#ec4899,#f43f5e)' },
  { value: 'slate', label: 'Slate', swatch: 'linear-gradient(135deg,#334155,#64748b)' },
  { value: 'violet', label: 'Violet', swatch: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' },
  { value: 'teal', label: 'Teal', swatch: 'linear-gradient(135deg,#14b8a6,#0d9488)' },
  { value: 'amber', label: 'Amber', swatch: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  { value: 'lime', label: 'Lime', swatch: 'linear-gradient(135deg,#84cc16,#65a30d)' },
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
  const [merchantLogoPaths, setMerchantLogoPaths] = useState({})
  const [records, setRecords] = useState([])
  const [walletRows, setWalletRows] = useState([])
  const [walletOpen, setWalletOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [typesOpen, setTypesOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [chargeTypes, setChargeTypes] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('chargeTypes'))
      return Array.isArray(v) ? v : DEFAULT_TYPES
    } catch {
      return DEFAULT_TYPES
    }
  })
  const [chargePresets, setChargePresets] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('chargePresets'))
      return Array.isArray(v) && v.length ? v : DEFAULT_PCTS
    } catch {
      return DEFAULT_PCTS
    }
  })
  const [dateFmt, setDateFmt] = useState(() => localStorage.getItem('datefmt') || 'dmy')
  const [density, setDensity] = useState(() => localStorage.getItem('density') || 'comfortable')
  const settingsRestoreRef = useRef(null)
  const [bankOpen, setBankOpen] = useState(false)
  const [walletLoading, setWalletLoading] = useState(true)
  const [walletError, setWalletError] = useState('')
  const walletRequest = useRef(0)
  const [filters, setFilters] = useState({ merchant: '', from: '', to: '', tag: '' })
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
  const merchantLogoUrls = useMemo(() => {
    if (!supabase) return {}
    return Object.fromEntries(Object.entries(merchantLogoPaths).map(([name, path]) => [
      name,
      supabase.storage.from('merchant-logos').getPublicUrl(path).data.publicUrl,
    ]))
  }, [merchantLogoPaths])
  const [authReady, setAuthReady] = useState(false)
  const [preferencesReadyForUser, setPreferencesReadyForUser] = useState(null)
  const [preferencesSyncUserId, setPreferencesSyncUserId] = useState(null)
  const [preferencesMigrationUser, setPreferencesMigrationUser] = useState(null)
  const preferencesSaveQueue = useRef(Promise.resolve())
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dashOpen, setDashOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryBusy, setEntryBusy] = useState(false)
  const [entryKey, setEntryKey] = useState(0)
  const [pageAtBottom, setPageAtBottom] = useState(false)
  const [pageCanScroll, setPageCanScroll] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [flashId, setFlashId] = useState(null)
  const [search, setSearch] = useState('')
  const entryRef = useRef(null)
  useEffect(() => {
    const updateScrollButton = () => {
      const bottom = document.documentElement.scrollHeight - window.innerHeight
      setPageCanScroll(bottom > 240)
      setPageAtBottom(bottom > 80 && window.scrollY >= bottom - 80)
    }
    updateScrollButton()
    window.addEventListener('scroll', updateScrollButton, { passive: true })
    window.addEventListener('resize', updateScrollButton)
    const observer = new ResizeObserver(updateScrollButton)
    observer.observe(document.documentElement)
    return () => {
      window.removeEventListener('scroll', updateScrollButton)
      window.removeEventListener('resize', updateScrollButton)
      observer.disconnect()
    }
  }, [])
  const allTags = useMemo(
    () => [...new Set(records.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b)),
    [records]
  )
  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    let rows = filters.tag ? records.filter((r) => (r.tags || []).includes(filters.tag)) : records
    if (term) {
      rows = rows.filter((r) =>
        `${r.merchant_name || ''} ${r.notes || ''} ${r.balance_date || ''} ${(r.tags || []).join(' ')}`.toLowerCase().includes(term)
      )
    }
    return rows
  }, [records, search, filters.tag])
  const [dashCfg, setDashCfg] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dashConfig.records.v1')) || {}
      if (Array.isArray(stored.statOrder)) {
        stored.statOrder = stored.statOrder.map((k) => (k === 'cashIn' ? 'bank' : k))
      }
      if (Array.isArray(stored.statHidden)) {
        stored.statHidden = stored.statHidden.filter((k) => k !== 'cashIn')
      }
      return { ...DEFAULT_CFG, ...stored }
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
      if (!s) {
        setEntryOpen(false)
        setWalletOpen(false)
        setPreferencesReadyForUser(null)
        setPreferencesSyncUserId(null)
        setPreferencesMigrationUser(null)
      }
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
    entryRef.current?.querySelector('.select-btn')?.focus()
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
      const items = [...entryRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.getClientRects().length && el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"]'))
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

  useEffect(() => {
    localStorage.setItem('chargeTypes', JSON.stringify(chargeTypes))
  }, [chargeTypes])

  useEffect(() => {
    localStorage.setItem('chargePresets', JSON.stringify(chargePresets))
  }, [chargePresets])

  useEffect(() => {
    setDateFormat(dateFmt)
    localStorage.setItem('datefmt', dateFmt)
  }, [dateFmt])

  useEffect(() => {
    document.documentElement.dataset.density = density === 'compact' ? 'compact' : ''
    localStorage.setItem('density', density)
  }, [density])
  const [reminder, setReminder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('reminderSettings')) || { enabled: false, time: '21:00' }
    } catch {
      return { enabled: false, time: '21:00' }
    }
  })

  const accountPreferences = useMemo(() => ({
    theme,
    currency,
    indianFmt,
    dateFmt,
    density,
    accent,
    chargeTypes,
    chargePresets,
    reminder,
    dashConfig: dashCfg,
  }), [theme, currency, indianFmt, dateFmt, density, accent, chargeTypes, chargePresets, reminder, dashCfg])
  const accountPreferencesRef = useRef(accountPreferences)
  useEffect(() => {
    accountPreferencesRef.current = accountPreferences
  }, [accountPreferences])

  useEffect(() => {
    const userId = session?.user?.id
    if (!supabase || !userId) return

    let active = true

    const cacheKey = `accountPreferences.v1.${userId}`
    const readCachedPreferences = () => {
      try {
        const cached = localStorage.getItem(cacheKey)
        return cached ? normalizeAccountPreferences(JSON.parse(cached)) : null
      } catch (error) {
        setStatus({ type: 'error', text: `Could not read saved account preferences: ${error.message}` })
        return null
      }
    }
    const applyPreferences = (preferences) => {
      setTheme(preferences.theme)
      setCurrency(preferences.currency)
      setIndianFmt(preferences.indianFmt)
      setDateFmt(preferences.dateFmt)
      setDensity(preferences.density)
      setAccent(preferences.accent)
      setChargeTypes(preferences.chargeTypes)
      setChargePresets(preferences.chargePresets)
      setReminder(preferences.reminder)
      setDashCfg(preferences.dashConfig)
    }

    const loadPreferences = async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .maybeSingle()
      if (!active) return

      if (error) {
        const cached = readCachedPreferences()
        const migratedUser = localStorage.getItem(ACCOUNT_PREFERENCES_MIGRATION_KEY)
        const fallback = cached || (migratedUser ? DEFAULT_ACCOUNT_PREFERENCES : accountPreferencesRef.current)
        applyPreferences(normalizeAccountPreferences(fallback))
        setPreferencesReadyForUser(userId)
        setPreferencesSyncUserId(null)
        setPreferencesMigrationUser(null)
        const migrationHint = ['42P01', 'PGRST205'].includes(error.code)
          ? ' Run the updated supabase.sql in the Supabase SQL Editor to enable syncing.'
          : ''
        setStatus({
          type: 'error',
          text: `Account preferences could not be loaded from Supabase (${error.message}). Using this device's current preferences.${migrationHint}`,
        })
        return
      }

      if (data?.preferences) {
        const preferences = normalizeAccountPreferences(data.preferences)
        applyPreferences(preferences)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(preferences))
          if (!localStorage.getItem(ACCOUNT_PREFERENCES_MIGRATION_KEY)) {
            localStorage.setItem(ACCOUNT_PREFERENCES_MIGRATION_KEY, userId)
          }
        } catch (cacheError) {
          setStatus({ type: 'error', text: `Could not cache account preferences on this device: ${cacheError.message}` })
        }
        setPreferencesReadyForUser(userId)
        setPreferencesSyncUserId(userId)
        setPreferencesMigrationUser(null)
        return
      }

      const cached = readCachedPreferences()
      const migratedUser = localStorage.getItem(ACCOUNT_PREFERENCES_MIGRATION_KEY)
      const shouldMigrateLegacy = !cached && !migratedUser
      const preferences = cached || normalizeAccountPreferences(
        shouldMigrateLegacy ? accountPreferencesRef.current : DEFAULT_ACCOUNT_PREFERENCES
      )
      applyPreferences(preferences)
      setPreferencesMigrationUser(shouldMigrateLegacy ? userId : null)
      setPreferencesReadyForUser(userId)
      setPreferencesSyncUserId(userId)
    }

    loadPreferences().catch((error) => {
      if (!active) return
      const cached = readCachedPreferences()
      applyPreferences(cached || DEFAULT_ACCOUNT_PREFERENCES)
      setPreferencesReadyForUser(userId)
      setPreferencesSyncUserId(null)
      setPreferencesMigrationUser(null)
      setStatus({ type: 'error', text: `Account preferences could not be loaded: ${error.message}` })
    })

    return () => {
      active = false
    }
  }, [session?.user?.id])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || preferencesReadyForUser !== userId) return
    try {
      localStorage.setItem(`accountPreferences.v1.${userId}`, JSON.stringify(accountPreferences))
    } catch (error) {
      setStatus({ type: 'error', text: `Could not cache account preferences on this device: ${error.message}` })
    }
  }, [accountPreferences, preferencesReadyForUser, session?.user?.id])

  useEffect(() => {
    const userId = session?.user?.id
    if (!supabase || !userId || preferencesReadyForUser !== userId || preferencesSyncUserId !== userId) return
    const preferences = accountPreferences
    const timeout = setTimeout(() => {
      preferencesSaveQueue.current = preferencesSaveQueue.current
        .then(async () => {
          const { error } = await supabase
            .from('user_preferences')
            .upsert({
              user_id: userId,
              preferences,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
          if (error) throw error

          if (preferencesMigrationUser === userId) {
            localStorage.setItem(ACCOUNT_PREFERENCES_MIGRATION_KEY, userId)
            setPreferencesMigrationUser(null)
          } else if (!localStorage.getItem(ACCOUNT_PREFERENCES_MIGRATION_KEY)) {
            localStorage.setItem(ACCOUNT_PREFERENCES_MIGRATION_KEY, userId)
          }
        })
        .catch((error) => {
          setStatus({ type: 'error', text: `Account preferences could not be saved to Supabase: ${error.message}` })
        })
    }, 500)
    return () => clearTimeout(timeout)
  }, [accountPreferences, preferencesReadyForUser, preferencesSyncUserId, preferencesMigrationUser, session?.user?.id])

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

      let missing = 0
      if (supabase && session) {
        const { data } = await supabase
          .from('daily_balances')
          .select('merchant_name')
          .eq('balance_date', todayStr)
        const updatedMerchants = new Set((data || []).map((r) => r.merchant_name))
        missing = merchants.filter((mName) => !updatedMerchants.has(mName)).length
      } else {
        const latest = latestWalletEntries(walletRows)
        const updated = latest.filter((r) => r.balance_date === todayStr).length
        missing = Math.max(0, merchants.length - updated)
      }

      if (missing > 0) {
        localStorage.setItem('lastReminderDate', todayStr)
        const title = 'Daily Balance Reminder'
        const body = `${missing} merchant${missing === 1 ? '' : 's'} still need closing balance entries for today.`
        
        // Native browser/OS notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: '/icon-192.png',
            tag: 'daily-reminder',
          })
        }
        // In-app interactive toast notification
        notify(body, 'info', {
          label: 'Add Entry',
          fn: () => newEntry(),
        })
      }
    }
    const id = setInterval(check, 60000)
    check()
    return () => clearInterval(id)
  }, [reminder, session, merchants, walletRows])

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

  const dark = theme === 'dark' || theme === 'black' || (theme === 'system' && sysDark)

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : ''
    document.documentElement.dataset.oled = theme === 'black' ? '1' : ''
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
      .select('merchant_name, initial_balance, logo_path')
      .order('merchant_name', { ascending: true })
    if (error && (error.message || '').includes('logo_path')) {
      ;({ data, error } = await supabase
        .from('merchants')
        .select('merchant_name, initial_balance')
        .order('merchant_name', { ascending: true }))
    }
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
      const logos = {}
      for (const r of data || []) {
        if (r.merchant_name) map[r.merchant_name] = Number(r.initial_balance) || 0
        if (r.merchant_name && r.logo_path) logos[r.merchant_name] = r.logo_path
      }
      setInitialBalances(map)
      setMerchantLogoPaths(logos)
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
    const selectWith = (cols, offset) =>
      supabase.from('daily_balances')
        .select(cols)
        .order('balance_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + 999)
    const FULL_COLS = 'id, merchant_name, balance_date, created_at, opening_balance, cash_in, cash_out, misc_expense, bank_amount, closing_balance'
    const NO_BANK_COLS = 'id, merchant_name, balance_date, created_at, opening_balance, cash_in, cash_out, misc_expense, closing_balance'
    let cols = FULL_COLS
    try {
      const rows = []
      for (let offset = 0; ; offset += 1000) {
        let { data, error } = await selectWith(cols, offset)
        if (error && cols === FULL_COLS && (error.message || '').includes('bank_amount')) {
          cols = NO_BANK_COLS
          ;({ data, error } = await selectWith(cols, offset))
        }
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

  const uploadMerchantLogo = async (name, file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      notify('Choose a JPEG, PNG, or WebP image.', 'error')
      return false
    }
    if (file.size > 2 * 1024 * 1024) {
      notify('Logo image must be 2 MB or smaller.', 'error')
      return false
    }
    if (!supabase) {
      notify('Supabase is not configured; merchant logos cannot be uploaded.', 'error')
      return false
    }

    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
    const newPath = `${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('merchant-logos')
      .upload(newPath, file, { contentType: file.type, cacheControl: '3600' })
    if (uploadError) {
      notify(`Could not upload merchant logo: ${uploadError.message}`, 'error')
      return false
    }

    const { error: updateError } = await supabase
      .from('merchants')
      .update({ logo_path: newPath })
      .eq('merchant_name', name)
    if (updateError) {
      const { error: cleanupError } = await supabase.storage.from('merchant-logos').remove([newPath])
      const setupHint = (updateError.message || '').includes('logo_path')
        ? ' Run the updated supabase.sql to enable merchant logos.'
        : ''
      const cleanupHint = cleanupError ? ` The uploaded file could not be cleaned up: ${cleanupError.message}` : ''
      notify(`Could not save merchant logo: ${updateError.message}.${setupHint}${cleanupHint}`, 'error')
      return false
    }

    const previousPath = merchantLogoPaths[name]
    setMerchantLogoPaths((paths) => ({ ...paths, [name]: newPath }))
    if (previousPath) {
      const { error: cleanupError } = await supabase.storage.from('merchant-logos').remove([previousPath])
      if (cleanupError) {
        notify(`Logo updated, but the old image could not be removed: ${cleanupError.message}`, 'info')
        return true
      }
    }
    notify(`Logo updated for "${name}".`, 'success')
    return true
  }

  const removeMerchantLogo = async (name) => {
    const path = merchantLogoPaths[name]
    if (!path || !supabase) return false
    const { error } = await supabase
      .from('merchants')
      .update({ logo_path: null })
      .eq('merchant_name', name)
    if (error) {
      const setupHint = (error.message || '').includes('logo_path')
        ? ' Run the updated supabase.sql to enable merchant logos.'
        : ''
      notify(`Could not remove merchant logo: ${error.message}.${setupHint}`, 'error')
      return false
    }
    setMerchantLogoPaths((paths) => {
      const next = { ...paths }
      delete next[name]
      return next
    })
    const { error: cleanupError } = await supabase.storage.from('merchant-logos').remove([path])
    if (cleanupError) {
      notify(`Logo removed from "${name}", but its image could not be deleted: ${cleanupError.message}`, 'info')
      return true
    }
    notify(`Logo removed from "${name}".`, 'success')
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

    const logoPath = merchantLogoPaths[name]
    const { data, error } = await supabase
      .from('merchants')
      .delete()
      .eq('merchant_name', name)
      .select('id')
    if (error) {
      setStatus({ type: 'error', text: error.message })
      notify(`Could not delete merchant: ${error.message}`, 'error')
      return false
    }
    if (!data || data.length === 0) {
      const msg = `Delete of "${name}" was blocked by the database — add a DELETE policy on the merchants table (see supabase.sql).`
      setStatus({ type: 'error', text: msg })
      notify(msg, 'error')
      return false
    }

    setMerchants((prev) => prev.filter((m) => m !== name))
    setMerchantLogoPaths((paths) => {
      const next = { ...paths }
      delete next[name]
      return next
    })
    if (selectMerchant === name) setSelectMerchant('')
    if (filters.merchant === name) {
      setFilters((f) => ({ ...f, merchant: '' }))
    }
    setStatus({ type: 'success', text: `Merchant "${name}" deleted.` })
    notify(`Merchant "${name}" deleted.`, 'success', {
      label: 'Undo',
      fn: () => restoreMerchant(name, initialBalances[name] || 0, logoPath),
    })
    return true
  }

  const restoreMerchant = async (name, bal, logoPath) => {
    if (!supabase) return
    let { error } = await supabase
      .from('merchants')
      .upsert({ merchant_name: name, initial_balance: bal, logo_path: logoPath || null }, { onConflict: 'merchant_name' })
    if (error && (error.message || '').includes('logo_path')) {
      ;({ error } = await supabase
        .from('merchants')
        .upsert({ merchant_name: name, initial_balance: bal }, { onConflict: 'merchant_name' }))
    }
    if (error && (error.message || '').includes('initial_balance')) {
      ;({ error } = await supabase
        .from('merchants')
        .upsert({ merchant_name: name }, { onConflict: 'merchant_name' }))
    }
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
    setMerchantLogoPaths((paths) => {
      if (!paths[oldName]) return paths
      const next = { ...paths, [newName]: paths[oldName] }
      delete next[oldName]
      return next
    })
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

  const saveRecord = async (payload, editingId, keepOpen = false) => {
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
        ? supabase.from('daily_balances').update(p).eq('id', editingId).select('id')
        : supabase.from('daily_balances').insert(p).select('id')

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
    setFlashId(editingId || result.data?.[0]?.id || null)
    setTimeout(() => setFlashId(null), 2500)
    if (!keepOpen) {
      setEntryOpen(false)
      setEditingRow(null)
      setCopySource(null)
    }
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
    const { id: _id, created_at: _created_at, ...rest } = row
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

  const resetLocal = async () => {
    const ok = await askConfirm('Clear local drafts, settings, and calculator lists? Cloud records are untouched.', {
      confirmLabel: 'Reset',
      danger: true,
    })
    if (!ok) return
    localStorage.clear()
    location.reload()
  }

  const deleteAllRecords = async () => {
    const ok = await askConfirm('Permanently delete ALL balance records for every merchant?', {
      confirmLabel: 'Delete all',
      danger: true,
    })
    if (!ok) return
    const sure = await askConfirm('This cannot be undone. Continue?', {
      confirmLabel: 'Yes, delete everything',
      danger: true,
    })
    if (!sure || !supabase) return
    const { error } = await supabase.from('daily_balances').delete().not('id', 'is', null)
    if (error) {
      notify(`Delete failed: ${error.message}`, 'error')
      return
    }
    notify('All records deleted.', 'success')
    await loadRecords(filters)
    await loadWallet()
  }

  const checkUpdates = async () => {
    notify('Checking for updates…', 'info')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
    } catch {
      /* no service worker */
    }
    setTimeout(() => location.reload(), 800)
  }

  const copyRecord = (row) => {
    setEntryKey((k) => k + 1)
    setEditingRow(null)
    setSelectMerchant('')
    setCopySource({ ...row, _tick: Date.now() })
    setEntryOpen(true)
  }

  const chainBreaks = useMemo(() => {
    const byMerchant = {}
    for (const r of walletRows) (byMerchant[r.merchant_name] ||= []).push(r)
    const breaks = new Map()
    for (const rows of Object.values(byMerchant)) {
      rows.sort(
        (a, b) =>
          (a.balance_date || '').localeCompare(b.balance_date || '') ||
          (a.created_at || '').localeCompare(b.created_at || '') ||
          String(a.id).localeCompare(String(b.id))
      )
      let last
      for (const r of rows) {
        if (last !== undefined && Math.abs(last - toNumber(r.opening_balance)) > 0.01) {
          breaks.set(r.id, last)
        }
        last = toNumber(r.closing_balance)
      }
    }
    return breaks
  }, [walletRows])

  const wallet = useMemo(() => {
    const entries = latestWalletEntries(walletRows)
    const todayStr = localToday()
    const yesterdayStr = localDay(-1)
    const todayChange = walletRows.reduce((total, row) => total + (row.balance_date === todayStr ? changeOf(row) : 0), 0)
    const yesterdayChange = walletRows.reduce((total, row) => total + (row.balance_date === yesterdayStr ? changeOf(row) : 0), 0)
    const hasYesterday = walletRows.some((r) => r.balance_date === yesterdayStr)
    const total = entries.reduce((sum, row) => sum + Math.round(toNumber(row.closing_balance) * 100), 0) / 100
    const bankByMerchant = {}
    let bankTotal = 0
    for (const row of walletRows) {
      const amt = toNumber(row.bank_amount)
      if (amt) bankByMerchant[row.merchant_name] = (bankByMerchant[row.merchant_name] || 0) + amt
      bankTotal += amt
    }
    return { total, todayChange, yesterdayChange, hasYesterday, entries, bankByMerchant, bankTotal }
  }, [walletRows])

  const bankMoves = useMemo(
    () => visibleRecords.filter((r) => toNumber(r.bank_amount) > 0),
    [visibleRecords]
  )

  const stats = useMemo(
    () => ({
      merchants: merchants.length,
      entries: visibleRecords.length,
      bank: visibleRecords.reduce((t, r) => t + toNumber(r.bank_amount), 0),
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
      { group: 'Go to', label: 'Reconciliation', run: () => { setAnalyticsOpen(true); go('recon')() } },
      { group: 'Go to', label: 'Saved balances table', run: go('records') },
      { group: 'Go to', label: 'Calculator', run: () => setCalcOpen(true) },
      { group: 'Go to', label: 'Charge calculator', run: () => setChargeOpen(true) },
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

  const exportBankPdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const pdfCur = currency === '₹' ? 'Rs ' : `${currency} ` // jsPDF default fonts lack the ₹ glyph
    const money = (v) => `${pdfCur}${toNumber(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const doc = new jsPDF()
    doc.setFontSize(15)
    doc.text('Moved to Bank', 14, 15)
    doc.setFontSize(9)
    doc.setTextColor(110)
    doc.text(`Generated ${new Date().toLocaleString()} · ${bankMoves.length} move${bankMoves.length === 1 ? '' : 's'} recorded`, 14, 21)
    autoTable(doc, {
      startY: 26,
      head: [['Date', 'Merchant', 'To Bank', 'Notes']],
      body: bankMoves.map((r) => [
        r.balance_date,
        r.merchant_name,
        money(r.bank_amount),
        r.notes || '',
      ]),
      foot: [['Total', '', money(stats.bank), '']],
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229] },
      footStyles: { fillColor: [238, 242, 255], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' } },
    })
    doc.save(`moved-to-bank-${new Date().toISOString().slice(0, 10)}.pdf`)
  }
  const showSkel = loading && records.length === 0
  const todayStr = localToday()
  const updatedToday = wallet.entries.filter((r) => r.balance_date === todayStr).length
  const pendingToday = merchants.filter((m) => !wallet.entries.some((r) => r.merchant_name === m && r.balance_date === todayStr))
  const brandLine = merchants.length
    ? `${TODAY_LABEL} · ${updatedToday} of ${merchants.length} merchant${merchants.length === 1 ? '' : 's'} updated today`
    : 'Track opening balance, money moved to bank, miscellaneous expense, and the end-of-day wallet amount per merchant.'
  const statDefs = {
    wallet: { cls: 'stat-wallet', value: wallet.total, format: moneyFmt, lbl: 'Total Wallet', icon: <Wallet size={17} className="stat-icon" aria-hidden="true" /> },
    today: {
      cls: 'stat-today',
      value: wallet.todayChange,
      format: (v) => `${v >= 0 ? '+' : ''}${fmt(v, currency)}`,
      lbl: "Today's Change",
      icon: <TrendingUp size={17} className="stat-icon" aria-hidden="true" />,
      sub: wallet.hasYesterday ? (
        <span className={`stat-sub ${wallet.todayChange - wallet.yesterdayChange >= 0 ? 'up' : 'down'}`}>
          {wallet.todayChange - wallet.yesterdayChange >= 0 ? '▲' : '▼'} {fmt(Math.abs(wallet.todayChange - wallet.yesterdayChange), currency)} vs yesterday
        </span>
      ) : null,
    },
    merchants: { cls: 'stat-1', value: stats.merchants, format: (v) => Math.round(v), lbl: 'Merchants', icon: <Store size={17} className="stat-icon" aria-hidden="true" /> },
    entries: { cls: 'stat-2', value: stats.entries, format: (v) => Math.round(v), lbl: 'Entries shown', icon: <List size={17} className="stat-icon" aria-hidden="true" /> },
    bank: { cls: 'stat-3', value: stats.bank, format: moneyFmt, lbl: 'Moved to Bank', icon: <Landmark size={17} className="stat-icon" aria-hidden="true" /> },
    misc: { cls: 'stat-4', value: stats.misc, format: moneyFmt, lbl: 'Total Misc Exp', icon: <Receipt size={17} className="stat-icon" aria-hidden="true" /> },
  }

  const sectionNodes = {
    charts: (
      <div key="charts" id="charts">
        <ChartsPanel records={visibleRecords} currency={currency} loading={loading} />
      </div>
    ),
    leaderboard: (
      <div key="leaderboard" id="leaderboard">
        <SummaryPanel records={visibleRecords} currency={currency} logoUrls={merchantLogoUrls} />
      </div>
    ),
    recon: (
      <div key="recon" id="recon">
        <ReconPanel rows={walletRows} currency={currency} logoUrls={merchantLogoUrls} onEdit={editRecord} />
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
          logoUrls={merchantLogoUrls}
          currency={currency}
          onFiltersChange={setFilters}
          allTags={allTags}
          onRefresh={() => loadRecords(filters)}
          onEdit={editRecord}
          search={search}
          onSearchChange={setSearch}
          onDelete={deleteRecord}
          onCopy={copyRecord}
          onBackup={backupData}
          onRestoreFile={restoreData}
          chainBreaks={chainBreaks}
          restoring={restoring}
          flashId={flashId}
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
  if (supabase && session && preferencesReadyForUser !== session.user.id) {
    return (
      <div className="wrap">
        <div className="card">
          <p>Loading your account preferences…</p>
        </div>
      </div>
    )
  }

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
            <div className="brand-row">
              <div className="brand-mark" aria-hidden="true"><Wallet size={20} /></div>
              <div>
                <h1>Merchant Daily Balance</h1>
                <span className="brand-accent" aria-hidden="true" />
              </div>
            </div>
            {merchants.length ? (
              <button type="button" className="brand-sub brand-sub-btn" aria-haspopup="dialog" onClick={() => setPendingOpen(true)}>
                {brandLine}
              </button>
            ) : (
              <p className="brand-sub">{brandLine}</p>
            )}
          </div>
          <div className="header-controls">
          <div className="actions header-primary">
            {session && (
              <details className="menu-wrap account-menu">
                <summary className="secondary"><MerchantAvatar name={session.user?.email || '?'} /> Account <ChevronDown size={14} /></summary>
                <div className="menu-panel">
                  <span className="account-email">{session.user?.email}</span>
                  <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </details>
            )}
            <button
              type="button"
              className="secondary small icon-button"
              onClick={() => setChargeOpen(true)}
              data-tip="Merchant charge calculator"
              aria-haspopup="dialog"
              aria-label="Merchant charge calculator"
            >
              <Calculator size={16} />
            </button>
            <button
              type="button"
              className="secondary small icon-button"
              onClick={() => setTheme(dark ? 'light' : 'dark')}
              data-tip={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              className="secondary small icon-button"
              onClick={() => setSettingsOpen(true)}
              data-tip="App settings"
              aria-haspopup="dialog"
              aria-label="Settings"
            >
              <Settings size={16} />
            </button>
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
                .map((k) => (k === 'wallet' || k === 'bank') ? (
                  <button key={k} type="button" className={`stat ${statDefs[k].cls} wallet-trigger`} aria-haspopup="dialog"
                    aria-label={k === 'wallet'
                      ? `Total wallet ${fmt(wallet.total, currency)}. View merchant breakdown`
                      : `Moved to bank ${fmt(stats.bank, currency)}. View details`}
                    onClick={() => (k === 'wallet' ? setWalletOpen(true) : setBankOpen(true))}>
                    {statDefs[k].icon}
                    <span className="num">{k === 'wallet' && walletLoading ? 'Loading…' : <CountUp value={statDefs[k].value} format={statDefs[k].format} />}</span>
                    <span className="lbl">{statDefs[k].lbl}</span>
                    <span className="stat-link">{k === 'wallet' ? (walletError ? 'Refresh failed — view details' : 'View breakdown') : 'View details'}</span>
                  </button>
                ) : (
                  <div key={k} className={`stat ${statDefs[k].cls}`}>
                    {statDefs[k].icon}
                    <div className="num"><CountUp value={statDefs[k].value} format={statDefs[k].format} /></div>
                    <div className="lbl">{statDefs[k].lbl}</div>
                    {statDefs[k].sub}
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
        <p className="ptr-hint no-print" aria-hidden="true">↓ Pull down to refresh</p>
        {sectionNodes.records}
        <section id="analytics" className={`workspace-section no-print${analyticsOpen ? '' : ' analytics-collapsed'}`}>
          <div className="sec-head">
            <h2>Analytics</h2>
            <button type="button" className="secondary small analytics-toggle" aria-expanded={analyticsOpen} aria-controls="analytics-content" onClick={() => setAnalyticsOpen((o) => !o)}>
              {analyticsOpen ? 'Collapse' : 'Expand'} <ChevronDown size={16} className={analyticsOpen ? 'flip' : ''} />
            </button>
          </div>
          <div id="analytics-content" className={`collapse${analyticsOpen ? '' : ' closed'}`}>
            <div className="collapse-inner">
              {analyticsOpen && dashCfg.sectionOrder.map((k) => sectionNodes[k] && !dashCfg.sectionHidden.includes(k) && sectionNodes[k])}
              {analyticsOpen && !loading && !visibleRecords.length && <p>No records match this view. Adjust the filters to see analytics.</p>}
            </div>
          </div>
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
            {wallet.entries.map((row, i) => (
              <li key={row.merchant_name} style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                <div className="wallet-item">
                  <MerchantAvatar name={row.merchant_name} logoUrl={merchantLogoUrls[row.merchant_name]} />
                  <div><strong>{row.merchant_name}</strong>
                    {row.balance_date !== todayStr && <span className="stale-badge">Not updated today</span>}
                    <span>Balance date: {displayDate(row.balance_date)}</span>
                    <span>Recorded: {displayDate(row.created_at, true)}</span>
                    {wallet.bankByMerchant[row.merchant_name] > 0 && (
                      <span className="bank-line">Moved to bank: {fmt(wallet.bankByMerchant[row.merchant_name], currency)}</span>
                    )}
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
          <div className="wallet-totals">
            <div className="wallet-total-row"><span>Total Wallet</span><strong>{fmt(wallet.total, currency)}</strong></div>
            {wallet.bankTotal > 0 && (
              <div className="wallet-total-row"><span>Total Moved to Bank</span><strong>{fmt(wallet.bankTotal, currency)}</strong></div>
            )}
          </div>
        </AccessibleDialog>
      )}

      {pendingOpen && (
        <AccessibleDialog title="Pending updates" onClose={() => setPendingOpen(false)}>
          {pendingToday.length ? (
            <>
              <p>{pendingToday.length} merchant{pendingToday.length === 1 ? ' has' : 's have'} no entry for {displayDate(todayStr)}.</p>
              <ul className="wallet-list" aria-label="Merchants pending today's entry">
                {pendingToday.map((m, i) => {
                  const last = wallet.entries.find((r) => r.merchant_name === m)
                  return (
                    <li key={m} style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                      <div className="wallet-item">
                        <MerchantAvatar name={m} logoUrl={merchantLogoUrls[m]} />
                        <div><strong>{m}</strong>
                          <span>{last ? `Last closing: ${fmt(last.closing_balance, currency)} · ${displayDate(last.balance_date)}` : 'No records yet'}</span>
                        </div>
                      </div>
                      <button type="button" className="small primary" onClick={() => { setPendingOpen(false); newEntry(m) }}>
                        <Plus size={14} /> Add entry
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p>All merchants have an entry for today.</p>
          )}
        </AccessibleDialog>
      )}

      {calcOpen && (
        <AccessibleDialog title="Calculator" className="calc-dialog" persistent onClose={() => setCalcOpen(false)}>
          <CalcPad />
          <div className="calc-swap">
            <button type="button" className="secondary small" onClick={() => { setCalcOpen(false); setChargeOpen(true) }}>
              Merchant charge calculator
            </button>
          </div>
        </AccessibleDialog>
      )}

      {chargeOpen && (
        <AccessibleDialog title="Charge calculator" className="calc-dialog" persistent onClose={() => setChargeOpen(false)}>
          <details className="hint">
            <summary>How is this calculated?</summary>
            <p>Merchant charges = Amount × charge rate. Final CC amount = Amount − charge rate amount. Retailer misc charges = charge rate amount − merchant type amount.</p>
          </details>
          <ChargeCalc currency={currency} types={chargeTypes} presets={chargePresets} />
          <div className="calc-swap">
            <button type="button" className="secondary small" onClick={() => { setChargeOpen(false); setCalcOpen(true) }}>
              Standard calculator
            </button>
          </div>
        </AccessibleDialog>
      )}

      {bankOpen && (
        <AccessibleDialog title="Moved to Bank" className="m-sheet" onClose={() => setBankOpen(false)}>
          <p>Every bank move recorded in the current view — merchant, date, and amount.</p>
          <ul className="wallet-list" aria-label="Bank move records">
            {bankMoves.map((row, i) => (
              <li key={row.id} style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                <div className="wallet-item">
                  <MerchantAvatar name={row.merchant_name} logoUrl={merchantLogoUrls[row.merchant_name]} />
                  <div><strong>{row.merchant_name}</strong>
                    <span>Date: {displayDate(row.balance_date)}</span>
                    {row.notes && <span>{row.notes}</span>}
                  </div>
                </div>
                <b>{fmt(row.bank_amount, currency)}</b>
              </li>
            ))}
          </ul>
          {!bankMoves.length && <p>No bank moves recorded in this view. Widen the filters to see more.</p>}
          <div className="detail-share-actions">
            <button type="button" className="secondary" onClick={exportBankPdf} disabled={!bankMoves.length}>
              <FileText size={15} /> Export PDF
            </button>
          </div>
          <div className="wallet-totals">
            <div className="wallet-total-row"><span>Total Moved to Bank</span><strong>{fmt(stats.bank, currency)}</strong></div>
          </div>
        </AccessibleDialog>
      )}

      {showMerchants && (
        <AccessibleDialog title="Merchant Settings" className="merchant-settings-dialog" onClose={() => setShowMerchants(false)}>
            <MerchantAdd
              merchants={merchants}
              balances={initialBalances}
              logoUrls={merchantLogoUrls}
              onAdd={addMerchant}
              onRename={renameMerchant}
              onDelete={deleteMerchant}
              onSetStart={setMerchantStart}
              onUploadLogo={uploadMerchantLogo}
              onRemoveLogo={removeMerchantLogo}
            />
        </AccessibleDialog>
      )}

      {typesOpen && (
        <AccessibleDialog title="Merchant Types" onClose={() => setTypesOpen(false)}>
          <ChargeTypes
            types={chargeTypes}
            onChange={setChargeTypes}
            onConfirm={askConfirm}
            notify={notify}
          />
        </AccessibleDialog>
      )}

      {presetsOpen && (
        <AccessibleDialog title="Rate Presets" onClose={() => setPresetsOpen(false)}>
          <PresetRates
            rates={chargePresets}
            onChange={setChargePresets}
            onConfirm={askConfirm}
            notify={notify}
          />
        </AccessibleDialog>
      )}

      <div className="entry-overlay no-print" hidden={!entryOpen} onClick={(e) => { if (e.target === e.currentTarget) closeEntry() }}>
        <aside className="entry-panel" ref={entryRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="entry-title" aria-describedby="entry-description">
          <div className="entry-panel-head">
            <div><h2 id="entry-title">{editingRow ? 'Edit entry' : copySource ? 'Copy entry' : 'New entry'}</h2><p id="entry-description">Record the actual closing balance for this merchant.</p></div>
            <button type="button" className="secondary icon-button" aria-label="Close entry panel" disabled={entryBusy} onClick={closeEntry}><X size={20} /></button>
          </div>
          <BalanceForm key={entryKey} merchants={merchants} initialBalances={initialBalances} logoUrls={merchantLogoUrls} editingRow={editingRow}
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
        <button type="button" onClick={() => setCalcOpen(true)} aria-label="Calculator">
          <Calculator size={19} />
          <span>Calc</span>
        </button>
      </nav>

      {pageCanScroll && !entryOpen && (
        <button
          type="button"
          className="scroll-jump no-print"
          aria-label={pageAtBottom ? 'Scroll to top' : 'Scroll to bottom'}
          title={pageAtBottom ? 'Scroll to top' : 'Scroll to bottom'}
          onClick={() => {
            const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
            window.scrollTo({
              top: pageAtBottom ? 0 : document.documentElement.scrollHeight,
              behavior,
            })
          }}
        >
          {pageAtBottom ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
        </button>
      )}

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

      {settingsOpen && (
        <AccessibleDialog title="Settings" className="settings-sheet m-sheet" onClose={() => setSettingsOpen(false)}>
          <div className="sheet-section">
            <h3>Manage</h3>
            <button type="button" className="secondary sheet-action" onClick={() => { setSettingsOpen(false); setShowMerchants(true) }}>
              <Store size={15} /> Merchants
            </button>
            <button type="button" className="secondary sheet-action" onClick={() => { setSettingsOpen(false); setTypesOpen(true) }}>
              <Percent size={15} /> Merchant types
            </button>
            <button type="button" className="secondary sheet-action" onClick={() => { setSettingsOpen(false); setPresetsOpen(true) }}>
              <ListOrdered size={15} /> Rate presets
            </button>
            <button type="button" className="secondary sheet-action" onClick={() => { setSettingsOpen(false); setDashOpen(true) }}>
              <SlidersHorizontal size={15} /> Customize dashboard
            </button>
            <button type="button" className="secondary sheet-action" onClick={() => { setSettingsOpen(false); setPaletteOpen(true) }}>
              <Command size={15} /> Command palette <span className="kbd-hint">Ctrl K</span>
            </button>
          </div>
          <div className="sheet-section">
            <h3>Reminders</h3>
            <div className="reminder-group">
              <Switch checked={reminder.enabled} onChange={toggleReminder} label="Remind me at" />
              <input type="time" className="time-input" aria-label="Reminder time" value={reminder.time}
                onChange={(e) => setReminder((r) => ({ ...r, time: e.target.value }))} disabled={!reminder.enabled} />
            </div>
          </div>
          <div className="sheet-section">
            <h3>Display</h3>
            <div className="prefs-grid">
              <label>Currency
                <Select label="Currency symbol" options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  value={currency} onChange={setCurrency} />
              </label>
              <label>Number format
                <Select label="Number format"
                  options={[{ value: 'in', label: '1,25,000' }, { value: 'us', label: '125,000' }]}
                  value={indianFmt ? 'in' : 'us'} onChange={(v) => setIndianFmt(v === 'in')} />
              </label>
              <label>Date format
                <Select label="Date format"
                  options={[{ value: 'dmy', label: '15 Oct 2026' }, { value: 'mdy', label: 'Oct 15, 2026' }, { value: 'iso', label: '2026-10-15' }]}
                  value={dateFmt} onChange={setDateFmt} />
              </label>
              <label>Theme
                <Select label="Theme"
                  options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'black', label: 'Black (OLED)' }]}
                  value={theme} onChange={setTheme} />
              </label>
              <label>Density
                <Select label="Density"
                  options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
                  value={density} onChange={setDensity} />
              </label>
              <label>Accent
                <Select label="Accent color"
                  options={ACCENTS.map((a) => ({ value: a.value, label: a.label, node: <span className="merchant-cell"><span className="accent-dot" style={{ background: a.swatch }} />{a.label}</span> }))}
                  value={accent} onChange={setAccent} />
              </label>
            </div>
          </div>
          <div className="sheet-section">
            <h3>Data</h3>
            <button type="button" className="secondary sheet-action" onClick={backupData}>
              <Download size={15} /> Export backup
            </button>
            <button type="button" className="secondary sheet-action" disabled={restoring} onClick={() => settingsRestoreRef.current?.click()}>
              <Upload size={15} /> {restoring ? 'Restoring…' : 'Restore backup'}
            </button>
            <input ref={settingsRestoreRef} type="file" accept=".json,application/json" hidden
              onChange={(e) => { restoreData(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="sheet-section danger-section">
            <h3>Danger zone</h3>
            <button type="button" className="secondary sheet-action" onClick={resetLocal}>
              <RefreshCw size={15} /> Reset local data
            </button>
            <button type="button" className="danger sheet-action" onClick={deleteAllRecords}>
              <Trash2 size={15} /> Delete all records
            </button>
          </div>
          <div className="sheet-section">
            <h3>About</h3>
            <div className="about-line">
              <span className="muted">Daily Net Balance v{pkg.version}</span>
              <button type="button" className="small secondary" onClick={checkUpdates}>Check for updates</button>
            </div>
          </div>
        </AccessibleDialog>
      )}

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
