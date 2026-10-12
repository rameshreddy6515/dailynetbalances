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

export default function SummaryPanel({ records, currency }) {
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
          cashIn: 0,
          cashOut: 0,
          misc: 0,
          change: 0,
          lastBalance: 0,
          lastKey: '',
        }
      }
      const s = byMerchant[m]
      s.count += 1
      s.cashIn += toNumber(r.cash_in)
      s.cashOut += toNumber(r.cash_out)
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
      <div className="summary-grid no-print">
        {summary.map((s, i) => (
          <div className="summary-card" key={s.name}>
            <div className="name">
              <span className={`rank rank-${i + 1 <= 3 ? i + 1 : 'n'}`}>{i + 1}</span>
              <span className="merchant-cell"><MerchantAvatar name={s.name} />{s.name}</span>
            </div>
            <Spark data={trends[s.name]} />
            <div className="row">
              <span>Entries</span>
              <b>{s.count}</b>
            </div>
            <div className="row">
              <span>Total Cash In</span>
              <b>{money(s.cashIn, currency)}</b>
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
      )}
        </div>
      </div>
    </>
  )
}
