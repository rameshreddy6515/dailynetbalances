import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ListTodo, Sparkles, TrendingUp, X } from 'lucide-react'
import { changeOf, fmt, latestWalletEntries, localToday } from '../format'

const DAY_MS = 86400000
const dayNum = (dateStr) => Math.round(new Date(`${dateStr}T00:00:00`).getTime() / DAY_MS)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function DailyBriefing({
  walletRows = [],
  merchants = [],
  pendingToday = [],
  chainBreaks,
  currency,
  onNewEntry,
  onOpenPending,
  onOpenBatch,
  onGoRecon,
}) {
  const todayStr = localToday()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('briefing.dismissed') === todayStr)

  const insights = useMemo(() => {
    const list = []
    const todayRows = walletRows.filter((r) => r.balance_date === todayStr)
    const dow = new Date(`${todayStr}T00:00:00`).getDay()

    if (pendingToday.length) {
      list.push({
        key: 'pending',
        tone: 'warn',
        icon: ListTodo,
        text: `${pendingToday.length} merchant${pendingToday.length === 1 ? '' : 's'} still need today's closing.`,
        secondaryAction: onOpenBatch ? { label: 'Batch EOD', fn: onOpenBatch } : null,
        action: { label: 'Review', fn: onOpenPending },
      })
    }

    if (chainBreaks && chainBreaks.size) {
      list.push({
        key: 'breaks',
        tone: 'danger',
        icon: AlertTriangle,
        text: `${chainBreaks.size} opening balance mismatch${chainBreaks.size === 1 ? '' : 'es'} found in the chain.`,
        action: { label: 'Reconcile', fn: onGoRecon },
      })
    }

    const idle = latestWalletEntries(walletRows)
      .map((r) => ({ m: r.merchant_name, days: dayNum(todayStr) - dayNum(r.balance_date) }))
      .filter((x) => x.days >= 4)
      .sort((a, b) => b.days - a.days)
    if (idle.length) {
      const top = idle[0]
      list.push({
        key: 'idle',
        tone: 'warn',
        icon: CalendarClock,
        text: `${top.m} — no entry for ${top.days} days${idle.length > 1 ? ` (+${idle.length - 1} more idle)` : ''}.`,
        action: { label: 'Log', fn: () => onNewEntry(top.m) },
      })
    }

    const byMerchant = {}
    for (const r of walletRows) (byMerchant[r.merchant_name] ||= []).push(r)
    let worst = null
    for (const r of todayRows) {
      const hist = (byMerchant[r.merchant_name] || [])
        .filter((x) => x.balance_date !== todayStr && new Date(`${x.balance_date}T00:00:00`).getDay() === dow)
        .map(changeOf)
      if (hist.length < 3) continue
      const avg = hist.reduce((a, b) => a + b, 0) / hist.length
      const dev = changeOf(r) - avg
      if (Math.abs(dev) > Math.max(Math.abs(avg), 500) * 0.4 && (!worst || Math.abs(dev) > Math.abs(worst.dev))) {
        worst = { m: r.merchant_name, dev, avg }
      }
    }
    if (worst) {
      const pct = Math.round((Math.abs(worst.dev) / Math.max(Math.abs(worst.avg), 1)) * 100)
      list.push({
        key: 'anomaly',
        tone: 'warn',
        icon: TrendingUp,
        text: `${worst.m} is ${pct}% ${worst.dev < 0 ? 'below' : 'above'} its usual ${WEEKDAYS[dow]}.`,
      })
    }

    if (todayRows.length) {
      const mover = [...todayRows].sort((a, b) => Math.abs(changeOf(b)) - Math.abs(changeOf(a)))[0]
      const ch = changeOf(mover)
      if (Math.abs(ch) > 0.01) {
        list.push({
          key: 'mover',
          tone: 'info',
          icon: TrendingUp,
          text: `Biggest mover today: ${mover.merchant_name} ${ch >= 0 ? '+' : '−'}${fmt(Math.abs(ch), currency)}.`,
        })
      }
    }

    if (!list.length && merchants.length && todayRows.length >= merchants.length) {
      list.push({ key: 'done', tone: 'ok', icon: CheckCircle2, text: `All ${merchants.length} merchants logged — day complete.` })
    }
    return list
  }, [walletRows, merchants, pendingToday, chainBreaks, todayStr, currency, onNewEntry, onOpenPending, onOpenBatch, onGoRecon])

  if (dismissed || !insights.length) return null

  return (
    <div className="briefing-strip no-print" role="status" aria-label="Daily briefing">
      <div className="briefing-head">
        <span className="briefing-title"><Sparkles size={13} aria-hidden="true" /> Briefing</span>
        <button
          type="button"
          className="briefing-dismiss"
          aria-label="Dismiss briefing"
          onClick={() => { localStorage.setItem('briefing.dismissed', todayStr); setDismissed(true) }}
        >
          <X size={13} />
        </button>
      </div>
      <ul className="briefing-list">
        {insights.slice(0, 4).map((i) => (
          <li key={i.key} className={`briefing-item ${i.tone}`}>
            <i.icon size={14} aria-hidden="true" />
            <span className="briefing-text">{i.text}</span>
            {i.secondaryAction && (
              <button type="button" className="small primary briefing-action" onClick={i.secondaryAction.fn}>
                {i.secondaryAction.label}
              </button>
            )}
            {i.action && (
              <button type="button" className="small secondary briefing-action" onClick={i.action.fn}>
                {i.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
