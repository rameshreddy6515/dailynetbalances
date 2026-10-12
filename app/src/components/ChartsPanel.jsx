import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import { changeOf, toNumber } from '../format'

const COLORS = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#e11d48', '#7c3aed', '#0891b2', '#65a30d']

export default function ChartsPanel({ records, currency, loading }) {
  const [range, setRange] = useState('all')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sec.charts') === '1')

  useEffect(() => {
    localStorage.setItem('sec.charts', collapsed ? '1' : '0')
  }, [collapsed])

  const daily = useMemo(() => {
    const byDate = {}
    for (const r of records) {
      const d = r.balance_date || ''
      byDate[d] = (byDate[d] || 0) + changeOf(r)
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, change]) => ({ date: date.slice(5), change: Number(change.toFixed(2)) }))
  }, [records])

  const perMerchant = useMemo(() => {
    const byMerchant = {}
    for (const r of records) {
      const m = r.merchant_name || 'Unknown'
      byMerchant[m] = (byMerchant[m] || 0) + changeOf(r)
    }
    return Object.entries(byMerchant)
      .map(([name, change]) => ({ name, change: Number(change.toFixed(2)) }))
      .sort((a, b) => b.change - a.change)
  }, [records])

  const weekday = useMemo(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const sums = Array(7).fill(0)
    const counts = Array(7).fill(0)
    for (const r of records) {
      const d = new Date(`${r.balance_date}T00:00:00`)
      if (Number.isNaN(d.getTime())) continue
      sums[d.getDay()] += changeOf(r)
      counts[d.getDay()] += 1
    }
    return [1, 2, 3, 4, 5, 6, 0].map((i) => ({
      day: names[i],
      change: counts[i] ? Number((sums[i] / counts[i]).toFixed(2)) : 0,
      entries: counts[i],
    }))
  }, [records])

  if (loading) {
    return (
      <>
        <div className="sec-head no-print">
          <h2>Charts</h2>
        </div>
        <div className="charts-grid no-print">
          {[0, 1, 2].map((i) => (
            <div key={i} className="chart-card">
              <div className="skel skel-lbl" style={{ width: '40%', marginBottom: 14 }} />
              <div className="skel" style={{ height: 180 }} />
            </div>
          ))}
        </div>
      </>
    )
  }
  if (!records.length) return null

  const bestDay = weekday.reduce((a, b) => (b.change > a.change ? b : a))
  const worstDay = weekday.reduce((a, b) => (b.change < a.change ? b : a))

  const tickStyle = { fontSize: 12, fill: 'var(--muted)' }
  const money = (v) => `${currency}${toNumber(v).toLocaleString('en-IN')}`

  return (
    <>
      <div className="sec-head no-print">
        <h2>Charts</h2>
        <button
          type="button"
          className="sec-toggle"
          data-tip={collapsed ? 'Expand section' : 'Collapse section'}
          aria-label={collapsed ? 'Expand charts' : 'Collapse charts'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronDown size={16} className={collapsed ? '' : 'flip'} />
        </button>
      </div>
      {!collapsed && (
    <div className="charts-grid no-print">
      <div className="chart-card">
        <div className="chart-head">
          <h3>Daily change</h3>
          <div className="range-row">
            {[['7', '7D'], ['30', '30D'], ['all', 'All']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`range-btn secondary ${range === k ? 'preset-active' : ''}`}
                onClick={() => setRange(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={range === 'all' ? daily : daily.slice(-Number(range))} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={tickStyle} />
            <YAxis tick={tickStyle} width={60} />
            <Tooltip formatter={(v) => [money(v), 'Change']} />
            <Line type="monotone" dataKey="change" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {perMerchant.length > 1 && (
      <div className="chart-card">
        <h3>Change per merchant</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={perMerchant} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={tickStyle} />
            <YAxis tick={tickStyle} width={60} />
            <Tooltip formatter={(v) => [money(v), 'Change']} />
            <Bar dataKey="change" radius={[6, 6, 0, 0]}>
              {perMerchant.map((entry, i) => (
                <Cell key={entry.name} fill={entry.change >= 0 ? COLORS[i % COLORS.length] : '#dc2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      <div className="chart-card">
        <h3>Weekday pattern <span className="chart-sub">avg change per day</span></h3>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={weekday} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={tickStyle} />
            <YAxis tick={tickStyle} width={60} />
            <Tooltip
              formatter={(v, _n, item) => [
                `${money(v)} avg (${item.payload.entries} entr${item.payload.entries === 1 ? 'y' : 'ies'})`,
                'Change',
              ]}
            />
            <Bar dataKey="change" radius={[6, 6, 0, 0]}>
              {weekday.map((entry) => (
                <Cell key={entry.day} fill={entry.change >= 0 ? '#059669' : '#dc2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-foot">
          Best: <b className="pos">{bestDay.day} ({money(bestDay.change)})</b> · Worst:{' '}
          <b className="neg">{worstDay.day} ({money(worstDay.change)})</b>
        </div>
      </div>
    </div>
      )}
    </>
  )
}
