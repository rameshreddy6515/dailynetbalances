import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
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
import { changeOf, localToday, toNumber } from '../format'

const COLORS = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#e11d48', '#7c3aed', '#0891b2', '#65a30d']
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ChartsPanel({
  records,
  calendarRecords,
  selectedDate = '',
  onSelectDate,
  currency,
  loading,
}) {
  const [range, setRange] = useState('all')
  const [userMonth, setUserMonth] = useState('')
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

  const calSource = calendarRecords ?? records
  const byFullDate = useMemo(() => {
    const map = {}
    let latest = ''
    for (const r of calSource) {
      const d = r.balance_date || ''
      if (!d) continue
      if (d > latest) latest = d
      const slot = (map[d] ||= { change: 0, count: 0 })
      slot.change += changeOf(r)
      slot.count += 1
    }
    return { map, latest }
  }, [calSource])

  const todayStr = localToday()
  const defaultMonth = selectedDate
    ? selectedDate.slice(0, 7)
    : (byFullDate.latest ? byFullDate.latest.slice(0, 7) : todayStr.slice(0, 7))
  const activeMonth = userMonth || defaultMonth

  const calendarData = useMemo(() => {
    const [year, month] = activeMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7
    const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const cells = []
    let maxAbs = 0
    let loggedDays = 0
    let monthNet = 0
    let elapsedDays = 0
    let bestDay = null
    let worstDay = null
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${activeMonth}-${String(day).padStart(2, '0')}`
      const entry = byFullDate.map[dateStr] || null
      if (dateStr <= todayStr) elapsedDays += 1
      if (entry) {
        loggedDays += 1
        monthNet += entry.change
        if (Math.abs(entry.change) > maxAbs) maxAbs = Math.abs(entry.change)
        if (!bestDay || entry.change > byFullDate.map[bestDay].change) bestDay = dateStr
        if (!worstDay || entry.change < byFullDate.map[worstDay].change) worstDay = dateStr
      }
      cells.push({ day, dateStr, entry })
    }
    if (loggedDays < 2) { bestDay = null; worstDay = null }
    return { label, firstOffset, cells, maxAbs: maxAbs || 1, loggedDays, elapsedDays, monthNet, bestDay, worstDay }
  }, [activeMonth, byFullDate, todayStr])

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
  if (!records.length && !calSource.length) return null

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
      <div className={`collapse${collapsed ? ' closed' : ''}`}>
        <div className="collapse-inner">
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

      <div className="chart-card cal-card">
        <div className="chart-head">
          <h3>Activity calendar <span className="chart-sub">tap a day to filter</span></h3>
          <div className="cal-nav">
            <button
              type="button"
              className="secondary small icon-button cal-nav-btn"
              aria-label="Previous month"
              onClick={() => setUserMonth(shiftMonth(activeMonth, -1))}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="cal-month-lbl">{calendarData.label}</span>
            <button
              type="button"
              className="secondary small icon-button cal-nav-btn"
              aria-label="Next month"
              onClick={() => setUserMonth(shiftMonth(activeMonth, 1))}
            >
              <ChevronRight size={15} />
            </button>
            {activeMonth !== todayStr.slice(0, 7) && (
              <button
                type="button"
                className="secondary small cal-today-btn"
                onClick={() => setUserMonth(todayStr.slice(0, 7))}
              >
                Today
              </button>
            )}
          </div>
        </div>
        <div className="cal-weekdays" aria-hidden="true">
          {WEEKDAYS_MON.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="cal-grid" role="grid" aria-label={`Activity calendar for ${calendarData.label}`}>
          {Array.from({ length: calendarData.firstOffset }, (_, idx) => (
            <span key={`pad-${idx}`} className="cal-pad" aria-hidden="true" />
          ))}
          {calendarData.cells.map(({ day, dateStr, entry }) => {
            const isSelected = selectedDate === dateStr
            const isToday = todayStr === dateStr
            const isFuture = dateStr > todayStr
            const isBest = calendarData.bestDay === dateStr
            const isWorst = calendarData.worstDay === dateStr
            const ratio = entry ? Math.min(1, Math.abs(entry.change) / calendarData.maxAbs) : 0
            const alpha = entry ? (0.18 + ratio * 0.56).toFixed(2) : 0
            const tone = entry
              ? (entry.change > 0.004 ? 'is-pos' : entry.change < -0.004 ? 'is-neg' : 'is-flat')
              : (isFuture ? 'is-future' : 'is-gap')
            const tip = entry
              ? `${dateStr}: ${entry.change >= 0 ? '+' : '−'}${money(Math.abs(entry.change))} (${entry.count} entr${entry.count === 1 ? 'y' : 'ies'})`
              : `${dateStr}: ${isFuture ? 'Upcoming' : 'No entries logged'}`
            return (
              <button
                key={dateStr}
                type="button"
                className={`cal-day ${tone}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${isBest ? ' is-best' : ''}${isWorst ? ' is-worst' : ''}`}
                style={entry ? { '--cal-alpha': alpha } : undefined}
                aria-pressed={isSelected}
                aria-label={tip}
                title={tip}
                onClick={() => onSelectDate?.(dateStr)}
              >
                <span className="cal-day-num">{day}</span>
                {entry && <span className="cal-day-dot" aria-hidden="true" />}
                {(isBest || isWorst) && <span className="cal-badge" aria-hidden="true">{isBest ? 'BEST' : 'WORST'}</span>}
              </button>
            )
          })}
        </div>
        <div className="chart-foot cal-foot">
          <span>
            Logged <b>{calendarData.loggedDays}</b>{calendarData.elapsedDays > 0 && ` / ${calendarData.elapsedDays}`} days · Net{' '}
            <b className={calendarData.monthNet >= 0 ? 'pos' : 'neg'}>
              {calendarData.monthNet >= 0 ? '+' : '−'}{money(Math.abs(calendarData.monthNet))}
            </b>
          </span>
          <span className="cal-legend">
            <span className="cal-key is-pos">Gain</span>
            <span className="cal-key is-neg">Drop</span>
            <span className="cal-key is-gap">Gap</span>
            {calendarData.bestDay && <span className="cal-key is-best-key">Best</span>}
            {calendarData.worstDay && <span className="cal-key is-worst-key">Worst</span>}
            {selectedDate && (
              <button type="button" className="secondary small cal-clear-btn" onClick={() => onSelectDate?.(selectedDate)}>
                <X size={12} /> {selectedDate}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
      )}
        </div>
      </div>
    </>
  )
}
