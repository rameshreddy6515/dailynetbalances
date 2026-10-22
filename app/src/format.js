export const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const changeOf = (r) =>
  toNumber(r.closing_balance) - toNumber(r.opening_balance)
  + toNumber(r.cash_out) + toNumber(r.misc_expense) + toNumber(r.bank_amount)

let numberLocale = 'en-IN'
export const setNumberLocale = (loc) => {
  numberLocale = loc === 'en-US' ? 'en-US' : 'en-IN'
}

export const fmt = (v, cur = '₹') =>
  `${cur}${toNumber(v).toLocaleString(numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export const CURRENCIES = ['₹', '$', '€', '£']

const MERCHANT_PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
]

export const merchantColor = (name) => {
  let h = 0
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return MERCHANT_PALETTE[h % MERCHANT_PALETTE.length]
}

export const merchantInitial = (name) => (String(name || '').trim()[0] || '?').toUpperCase()

export const latestWalletEntries = (rows) => {
  const latest = new Map()
  const key = (r) => `${r.balance_date || ''}|${r.created_at || ''}|${r.id || ''}`
  for (const row of rows) {
    const previous = latest.get(row.merchant_name)
    if (!previous || key(row) > key(previous)) latest.set(row.merchant_name, row)
  }
  return [...latest.values()].sort((a, b) => a.merchant_name.localeCompare(b.merchant_name))
}

let dateFormat = 'dmy'
export const setDateFormat = (f) => {
  dateFormat = ['dmy', 'mdy', 'iso'].includes(f) ? f : 'dmy'
}

export const displayDate = (value, withTime = false) => {
  if (!value) return 'Not recorded'
  const date = new Date(withTime ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  if (withTime) return date.toLocaleString()
  if (dateFormat === 'iso') return String(value).slice(0, 10)
  const locale = dateFormat === 'mdy' ? 'en-US' : 'en-GB'
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const localDay = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const localToday = () => localDay(0)
