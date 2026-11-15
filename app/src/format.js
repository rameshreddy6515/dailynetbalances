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

export const evalMoneyExpr = (raw) => {
  if (raw === null || raw === undefined) return { value: 0, isExpr: false, valid: false }
  const str = String(raw).trim()
  if (!str) return { value: 0, isExpr: false, valid: false }
  const cleaned = str.replace(/[\s,]/g, '').replace(/=+$/, '')
  if (!cleaned) return { value: 0, isExpr: false, valid: false }
  if (/^\d*\.?\d*$/.test(cleaned) && cleaned !== '.') {
    const n = Number(cleaned)
    return { value: Number.isFinite(n) ? n : 0, isExpr: str.includes('='), valid: true }
  }
  if (!/^[0-9.+\-*/()]+$/.test(cleaned)) return { value: 0, isExpr: false, valid: false }
  const expr = cleaned.replace(/[+\-*/.]+$/, '')
  if (!expr) return { value: 0, isExpr: false, valid: false }
  const isExpr = /[+*/()=]/.test(str) || /(?<=.)[-+]/.test(cleaned) || cleaned.slice(1).includes('-')

  let pos = 0
  const parseExpr = () => {
    let left = parseTerm()
    while (pos < expr.length && (expr[pos] === '+' || expr[pos] === '-')) {
      const op = expr[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  const parseTerm = () => {
    let left = parseFactor()
    while (pos < expr.length && (expr[pos] === '*' || expr[pos] === '/')) {
      const op = expr[pos++]
      const right = parseFactor()
      left = op === '*' ? left * right : right === 0 ? NaN : left / right
    }
    return left
  }
  const parseFactor = () => {
    if (expr[pos] === '+') { pos++; return parseFactor() }
    if (expr[pos] === '-') { pos++; return -parseFactor() }
    if (expr[pos] === '(') {
      pos++
      const v = parseExpr()
      if (expr[pos] === ')') pos++
      return v
    }
    const start = pos
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++
    if (start === pos) return NaN
    return Number(expr.slice(start, pos))
  }

  const res = parseExpr()
  if (pos !== expr.length || !Number.isFinite(res)) return { value: 0, isExpr, valid: false }
  return { value: Math.max(0, Math.round(res * 100) / 100), isExpr, valid: true }
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const underHundred = (n) => {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = ONES[n % 10]
  return o ? `${t}-${o}` : t
}

const underThousand = (n) => {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (!h) return underHundred(r)
  return r ? `${ONES[h]} hundred ${underHundred(r)}` : `${ONES[h]} hundred`
}

const intWordsIndian = (n) => {
  if (n === 0) return 'zero'
  const parts = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${intWordsIndian(crore)} crore`)
  if (lakh) parts.push(`${underHundred(lakh)} lakh`)
  if (thousand) parts.push(`${underHundred(thousand)} thousand`)
  if (rest) parts.push(underThousand(rest))
  return parts.join(' ')
}

const intWordsIntl = (n) => {
  if (n === 0) return 'zero'
  const parts = []
  const billion = Math.floor(n / 1000000000)
  const million = Math.floor((n % 1000000000) / 1000000)
  const thousand = Math.floor((n % 1000000) / 1000)
  const rest = n % 1000
  if (billion) parts.push(`${underThousand(billion)} billion`)
  if (million) parts.push(`${underThousand(million)} million`)
  if (thousand) parts.push(`${underThousand(thousand)} thousand`)
  if (rest) parts.push(underThousand(rest))
  return parts.join(' ')
}

export const amountToWords = (value, indian = numberLocale === 'en-IN') => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) return ''
  let whole = Math.floor(n)
  let cents = Math.round((n - whole) * 100)
  if (cents === 100) { whole += 1; cents = 0 }
  const words = indian ? intWordsIndian(whole) : intWordsIntl(whole)
  const full = cents > 0 ? `${words} and ${String(cents).padStart(2, '0')}/100` : words
  return full.charAt(0).toUpperCase() + full.slice(1)
}
