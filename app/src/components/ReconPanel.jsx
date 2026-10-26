import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CopyX, CalendarOff, Link2Off } from 'lucide-react'
import { fmt, toNumber, displayDate } from '../format'
import MerchantAvatar from './MerchantAvatar'

const DAY_MS = 86400000
const dayNum = (dateStr) => Math.round(new Date(`${dateStr}T00:00:00`).getTime() / DAY_MS)

export default function ReconPanel({ rows = [], currency, logoUrls = {}, onEdit }) {
  const [openMerchant, setOpenMerchant] = useState(null)

  const issues = useMemo(() => {
    const byMerchant = {}
    for (const r of rows) (byMerchant[r.merchant_name] ||= []).push(r)
    const list = []
    for (const [merchant, mRows] of Object.entries(byMerchant)) {
      const sorted = [...mRows].sort(
        (a, b) =>
          (a.balance_date || '').localeCompare(b.balance_date || '') ||
          (a.created_at || '').localeCompare(b.created_at || '') ||
          String(a.id).localeCompare(String(b.id))
      )

      const seenDates = new Map()
      for (const r of sorted) {
        seenDates.set(r.balance_date, (seenDates.get(r.balance_date) || 0) + 1)
      }

      let prev = null
      for (const r of sorted) {
        if (prev) {
          const gap = dayNum(r.balance_date) - dayNum(prev.balance_date)
          const prevClose = toNumber(prev.closing_balance)
          const opening = toNumber(r.opening_balance)
          if (r.balance_date !== prev.balance_date && Math.abs(opening - prevClose) > 0.01) {
            list.push({
              type: 'break',
              merchant,
              date: r.balance_date,
              expected: prevClose,
              actual: opening,
              diff: opening - prevClose,
              row: r,
            })
          }
          if (gap > 1) {
            list.push({
              type: 'missing',
              merchant,
              from: prev.balance_date,
              to: r.balance_date,
              days: gap - 1,
              row: r,
            })
          }
        }
        prev = r
      }

      for (const [date, count] of seenDates) {
        if (count > 1) {
          list.push({ type: 'duplicate', merchant, date, count, row: sorted.find((r) => r.balance_date === date) })
        }
      }
    }
    return list.sort(
      (a, b) => (b.date || b.to || '').localeCompare(a.date || a.to || '') || a.merchant.localeCompare(b.merchant)
    )
  }, [rows])

  const byMerchant = useMemo(() => {
    const map = new Map()
    for (const issue of issues) {
      if (!map.has(issue.merchant)) map.set(issue.merchant, [])
      map.get(issue.merchant).push(issue)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [issues])

  const icons = { break: Link2Off, duplicate: CopyX, missing: CalendarOff }

  return (
    <div className="section recon-section workspace-section">
      <div className="sec-head">
        <h2>
          Reconciliation{' '}
          <span className={`count-chip${issues.length ? ' warn' : ''}`}>{issues.length}</span>
        </h2>
      </div>
      <p className="muted recon-intro">
        Checks each merchant&apos;s balance chain: opening vs. previous closing, duplicate daily entries, and
        skipped days between entries.
      </p>
      {!rows.length ? (
        <p className="muted">No records loaded yet — reconciliation runs over the full balance history.</p>
      ) : !issues.length ? (
        <p className="recon-clear">
          <CheckCircle2 size={16} /> All merchant balance chains are consistent.
        </p>
      ) : (
        <ul className="recon-list">
          {byMerchant.map(([merchant, mIssues]) => (
            <li key={merchant} className="recon-merchant">
              <button
                type="button"
                className="recon-merchant-head"
                aria-expanded={openMerchant === merchant}
                onClick={() => setOpenMerchant((cur) => (cur === merchant ? null : merchant))}
              >
                <span className="merchant-cell">
                  <MerchantAvatar name={merchant} logoUrl={logoUrls[merchant]} />
                  <b>{merchant}</b>
                </span>
                <span className="recon-count">{mIssues.length} issue{mIssues.length === 1 ? '' : 's'}</span>
                <ChevronDown size={15} className={openMerchant === merchant ? 'flip' : ''} />
              </button>
              {openMerchant === merchant && (
                <ul className="recon-issues">
                  {mIssues.map((issue, i) => {
                    const Icon = icons[issue.type]
                    return (
                      <li key={i} className={`recon-issue recon-${issue.type}`}>
                        <Icon size={15} aria-hidden="true" />
                        <div className="recon-detail">
                          {issue.type === 'break' && (
                            <>
                              <b>Opening mismatch on {displayDate(issue.date)}</b>
                              <span>
                                Expected {fmt(issue.expected, currency)} but opening is{' '}
                                {fmt(issue.actual, currency)} — difference{' '}
                                <b className={issue.diff >= 0 ? 'pos' : 'neg'}>
                                  {issue.diff >= 0 ? '+' : '−'}{fmt(Math.abs(issue.diff), currency)}
                                </b>
                              </span>
                            </>
                          )}
                          {issue.type === 'duplicate' && (
                            <>
                              <b>{issue.count} entries on {displayDate(issue.date)}</b>
                              <span>Duplicate daily entries may inflate totals.</span>
                            </>
                          )}
                          {issue.type === 'missing' && (
                            <>
                              <b>{issue.days} day{issue.days === 1 ? '' : 's'} skipped</b>
                              <span>
                                No entries between {displayDate(issue.from)} and {displayDate(issue.to)}.
                              </span>
                            </>
                          )}
                        </div>
                        {onEdit && issue.row && issue.type !== 'missing' && (
                          <button type="button" className="small secondary" onClick={() => onEdit(issue.row)}>
                            Edit
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <p className="muted recon-note">
          <AlertTriangle size={13} aria-hidden="true" /> Mismatches usually mean an edited/deleted earlier entry
          or a missed day. Fix the flagged entry or add the missing one.
        </p>
      )}
    </div>
  )
}
