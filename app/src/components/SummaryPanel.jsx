import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { changeOf, fmt, toNumber } from '../format'
import MerchantAvatar from './MerchantAvatar'

const money = fmt

const Spark = ({ data }) => {
  if (!data || data.length < 2) return null
  const pts = data.slice(-14)
  const w = 110
  const h = 26
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const rng = max - min || 1
  const line = pts
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - 3 - ((v - min) / rng) * (h - 6)}`)
    .join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={line} fill="none" stroke={up ? '#10b981' : '#f43f5e'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function SummaryPanel({ records, currency, logoUrls = {} }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sec.leaderboard') === '1')

  useEffect(() => {
    localStorage.setItem('sec.leaderboard', collapsed ? '1' : '0')
  }, [collapsed])

  const summary = useMemo(() => {
    const byMerchant = {}
    for (const r of records) {
      const m = r.merchant_name || 'Unknown'
      if (!byMerchant[m]) {
        byMerchant[m] = {
          name: m,
          count: 0,
          bank: 0,
          misc: 0,
          change: 0,
          lastBalance: 0,
          lastKey: '',
        }
      }
      const s = byMerchant[m]
      s.count += 1
      s.bank += toNumber(r.bank_amount)
      s.misc += toNumber(r.misc_expense)
      s.change += changeOf(r)
      const key = `${r.balance_date}|${r.created_at || ''}`
      if (key > s.lastKey) {
        s.lastKey = key
        s.lastBalance = toNumber(r.closing_balance)
      }
    }
    return Object.values(byMerchant).sort((a, b) => b.change - a.change)
  }, [records])

  const trends = useMemo(() => {
    const sorted = [...records].sort((a, b) =>
      `${a.balance_date}|${a.created_at || ''}`.localeCompare(`${b.balance_date}|${b.created_at || ''}`)
    )
    const byM = {}
    for (const r of sorted) {
      const m = r.merchant_name || 'Unknown'
      byM[m] = byM[m] || []
      byM[m].push((byM[m][byM[m].length - 1] || 0) + changeOf(r))
    }
    return byM
  }, [records])

  const recurringPatterns = useMemo(() => {
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const byMerchant = {}
    const sorted = [...records].sort((a, b) =>
      `${a.balance_date}|${a.created_at || ''}`.localeCompare(`${b.balance_date}|${b.created_at || ''}`)
    )
    for (const r of sorted) {
      const m = r.merchant_name || 'Unknown'
      const d = new Date(`${r.balance_date}T00:00:00`)
      if (Number.isNaN(d.getTime())) continue
      const slot = (byMerchant[m] ||= { count: 0, total: 0, weekdays: Array.from({ length: 7 }, () => ({ sum: 0, count: 0 })) })
      const change = changeOf(r)
      slot.count += 1
      slot.total += change
      slot.weekdays[d.getDay()].sum += change
      slot.weekdays[d.getDay()].count += 1
    }

    return Object.entries(byMerchant)
      .map(([name, data]) => {
        const observed = data.weekdays
          .map((entry, idx) => ({ day: weekdayNames[idx], avg: entry.count ? entry.sum / entry.count : null, count: entry.count }))
          .filter((entry) => entry.avg !== null)
        if (observed.length < 2 || data.count < 4) return null
        const strongest = observed.reduce((best, cur) => (Math.abs(cur.avg) > Math.abs(best.avg) ? cur : best))
        const positive = observed.reduce((best, cur) => (cur.avg > best.avg ? cur : best))
        const negative = observed.reduce((best, cur) => (cur.avg < best.avg ? cur : best))
        const spread = positive.avg - negative.avg
        if (Math.abs(spread) < 0.01 && data.count < 6) return null
        return {
          name,
          count: data.count,
          avg: data.total / data.count,
          positive,
          negative,
          spread,
          strongest,
        }
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread))
      .slice(0, 3)
  }, [records])

  if (!summary.length) return null

  return (
    <>
      <div className="sec-head no-print">
        <h2>Merchant leaderboard</h2>
        <button
          type="button"
          className="sec-toggle"
          data-tip={collapsed ? 'Expand section' : 'Collapse section'}
          aria-label={collapsed ? 'Expand leaderboard' : 'Collapse leaderboard'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronDown size={16} className={collapsed ? '' : 'flip'} />
        </button>
      </div>
      <div className={`collapse${collapsed ? ' closed' : ''}`}>
        <div className="collapse-inner">
      {!collapsed && (
        <>
          <div className="summary-grid no-print">
            {summary.map((s, i) => (
              <div className="summary-card" key={s.name}>
                <div className="name">
                  <span className={`rank rank-${i + 1 <= 3 ? i + 1 : 'n'}`}>{i + 1}</span>
                  <span className="merchant-cell"><MerchantAvatar name={s.name} logoUrl={logoUrls[s.name]} />{s.name}</span>
                </div>
                <Spark data={trends[s.name]} />
                <div className="row">
                  <span>Entries</span>
                  <b>{s.count}</b>
                </div>
                <div className="row">
                  <span>Moved to Bank</span>
                  <b>{money(s.bank, currency)}</b>
                </div>
                <div className="row">
                  <span>Total Misc Exp</span>
                  <b>{money(s.misc, currency)}</b>
                </div>
                <div className="row">
                  <span>Total Change</span>
                  <b className={s.change >= 0 ? 'pos' : 'neg'}>{money(s.change, currency)}</b>
                </div>
                <div className="row">
                  <span>Last Balance</span>
                  <b>{money(s.lastBalance, currency)}</b>
                </div>
              </div>
            ))}
          </div>
          {recurringPatterns.length > 0 && (
            <div className="pattern-grid no-print">
              <div className="pattern-head">
                <h3>Recurring patterns</h3>
                <span className="chart-sub">weekday tendency by merchant</span>
              </div>
              <div className="pattern-cards">
                {recurringPatterns.map((pattern) => (
                  <div className="pattern-card" key={pattern.name}>
                    <div className="pattern-top">
                      <span className="merchant-cell"><MerchantAvatar name={pattern.name} logoUrl={logoUrls[pattern.name]} />{pattern.name}</span>
                      <span className="pattern-pill">{pattern.count} entries</span>
                    </div>
                    <div className="pattern-row">
                      <span>Strongest swing</span>
                      <b className={pattern.strongest.avg >= 0 ? 'pos' : 'neg'}>{pattern.strongest.day} · {money(pattern.strongest.avg, currency)}</b>
                    </div>
                    <div className="pattern-row">
                      <span>Best weekday</span>
                      <b className="pos">{pattern.positive.day} · {money(pattern.positive.avg, currency)}</b>
                    </div>
                    <div className="pattern-row">
                      <span>Weakest weekday</span>
                      <b className="neg">{pattern.negative.day} · {money(pattern.negative.avg, currency)}</b>
                    </div>
                    <div className="pattern-row">
                      <span>Spread</span>
                      <b>{money(pattern.spread, currency)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </div>
    </>
  )
}
