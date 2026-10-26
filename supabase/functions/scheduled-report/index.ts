// Scheduled daily/weekly balance report.
//
// Queries daily_balances for the requested period, renders a PDF summary
// with pdf-lib, and emails it (plus an HTML summary) via Resend.
//
// Deploy (from repo root):
//   supabase functions deploy scheduled-report --no-verify-jwt
//
// Required secrets (supabase secrets set KEY=value):
//   RESEND_API_KEY        - Resend API key (https://resend.com)
//   REPORT_TO_EMAIL       - recipient address
//   REPORT_FROM_EMAIL     - e.g. "DailyNet <reports@yourdomain.com>" (domain must be verified in Resend)
//   REPORT_CRON_SECRET    - random secret; cron calls must send it as a Bearer token
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// See the commented pg_cron block at the bottom of supabase.sql for scheduling.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

const RESEND_URL = 'https://api.resend.com/emails'
const INR_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const toNum = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const money = (v: number): string => `Rs ${INR_FMT.format(v)}` // pdf-lib standard fonts lack the rupee glyph
const changeOf = (r: Record<string, unknown>): number =>
  toNum(r.closing_balance) - toNum(r.opening_balance) + toNum(r.cash_out) + toNum(r.misc_expense) + toNum(r.bank_amount)

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function periodRange(period: string): { from: string; to: string; label: string } {
  const now = new Date()
  if (period === 'weekly') {
    const to = new Date(now)
    to.setDate(to.getDate() - 1) // report covers the completed week
    const from = new Date(to)
    from.setDate(from.getDate() - 6)
    return { from: iso(from), to: iso(to), label: 'Weekly report' }
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return { from: iso(yesterday), to: iso(yesterday), label: 'Daily report' }
}

interface MerchantSummary {
  merchant: string
  entries: number
  opening: number
  cashOut: number
  bank: number
  misc: number
  closing: number
  change: number
}

function summarize(rows: Record<string, unknown>[]): { merchants: MerchantSummary[]; totals: MerchantSummary } {
  const byMerchant = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const name = String(r.merchant_name || '')
    if (!byMerchant.has(name)) byMerchant.set(name, [])
    byMerchant.get(name)!.push(r)
  }
  const merchants: MerchantSummary[] = [...byMerchant.entries()].map(([merchant, mRows]) => {
    const sorted = [...mRows].sort((a, b) => String(a.balance_date).localeCompare(String(b.balance_date)))
    return {
      merchant,
      entries: mRows.length,
      opening: toNum(sorted[0].opening_balance),
      cashOut: mRows.reduce((t, r) => t + toNum(r.cash_out), 0),
      bank: mRows.reduce((t, r) => t + toNum(r.bank_amount), 0),
      misc: mRows.reduce((t, r) => t + toNum(r.misc_expense), 0),
      closing: toNum(sorted[sorted.length - 1].closing_balance),
      change: mRows.reduce((t, r) => t + changeOf(r), 0),
    }
  })
  merchants.sort((a, b) => a.merchant.localeCompare(b.merchant))
  const totals = merchants.reduce(
    (t, m) => ({
      merchant: 'Total',
      entries: t.entries + m.entries,
      opening: t.opening + m.opening,
      cashOut: t.cashOut + m.cashOut,
      bank: t.bank + m.bank,
      misc: t.misc + m.misc,
      closing: t.closing + m.closing,
      change: t.change + m.change,
    }),
    { merchant: 'Total', entries: 0, opening: 0, cashOut: 0, bank: 0, misc: 0, closing: 0, change: 0 }
  )
  return { merchants, totals }
}

async function buildPdf(label: string, from: string, to: string, merchants: MerchantSummary[], totals: MerchantSummary): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.12, 0.16, 0.23)
  const muted = rgb(0.43, 0.47, 0.53)
  const accent = rgb(0.31, 0.27, 0.9)

  const cols: { label: string; get: (m: MerchantSummary) => string; width: number; right?: boolean }[] = [
    { label: 'Merchant', get: (m) => m.merchant, width: 150 },
    { label: 'Entries', get: (m) => String(m.entries), width: 45, right: true },
    { label: 'Opening', get: (m) => money(m.opening), width: 85, right: true },
    { label: 'Cash Out', get: (m) => money(m.cashOut), width: 75, right: true },
    { label: 'To Bank', get: (m) => money(m.bank), width: 75, right: true },
    { label: 'Misc', get: (m) => money(m.misc), width: 70, right: true },
    { label: 'Closing', get: (m) => money(m.closing), width: 85, right: true },
    { label: 'Net Change', get: (m) => `${m.change >= 0 ? '+' : '-'}${money(Math.abs(m.change))}`, width: 90, right: true },
  ]
  const tableWidth = cols.reduce((w, c) => w + c.width, 0)
  const margin = 40
  const rowH = 18

  let page = doc.addPage([margin * 2 + tableWidth, 700])
  let y = page.getHeight() - margin

  const drawText = (text: string, x: number, yy: number, size = 9, f = font, color = ink) => {
    page.drawText(text, { x, y: yy, size, font: f, color })
  }
  const drawCell = (text: string, x: number, yy: number, width: number, right: boolean | undefined, f = font) => {
    const size = 8
    let t = text
    while (t.length > 3 && f.widthOfTextAtSize(t, size) > width - 6) t = `${t.slice(0, -2)}…`
    const tx = right ? x + width - 6 - f.widthOfTextAtSize(t, size) : x + 2
    page.drawText(t, { x: tx, y: yy, size, font: f, color: ink })
  }
  const header = () => {
    y -= rowH
    let x = margin
    page.drawRectangle({ x: margin, y: y - 3, width: tableWidth, height: rowH, color: rgb(0.95, 0.95, 0.99) })
    for (const c of cols) {
      drawCell(c.label, x, y + 2, c.width, c.right, bold)
      x += c.width
    }
  }

  page.drawText(`Merchant Daily Balance — ${label}`, { x: margin, y, size: 15, font: bold, color: accent })
  y -= 16
  drawText(`Period ${from} to ${to} · Generated ${new Date().toLocaleString('en-IN')} · ${merchants.length} merchants`, margin, y, 9, font, muted)

  header()
  for (const m of merchants) {
    if (y < margin + rowH * 2) {
      page = doc.addPage([margin * 2 + tableWidth, 700])
      y = page.getHeight() - margin
      header()
    }
    y -= rowH
    let x = margin
    for (const c of cols) {
      drawCell(c.get(m), x, y + 2, c.width, c.right)
      x += c.width
    }
    page.drawLine({ start: { x: margin, y: y - 3 }, end: { x: margin + tableWidth, y: y - 3 }, thickness: 0.4, color: rgb(0.88, 0.89, 0.92) })
  }
  y -= rowH
  let x = margin
  page.drawRectangle({ x: margin, y: y - 3, width: tableWidth, height: rowH, color: rgb(0.93, 0.94, 1) })
  for (const c of cols) {
    drawCell(c.get(totals), x, y + 2, c.width, c.right, bold)
    x += c.width
  }

  return doc.save()
}

function buildHtml(label: string, from: string, to: string, merchants: MerchantSummary[], totals: MerchantSummary): string {
  const row = (m: MerchantSummary) =>
    `<tr><td>${m.merchant}</td><td>${m.entries}</td><td>${money(m.opening)}</td><td>${money(m.bank)}</td><td>${money(m.misc)}</td><td>${money(m.closing)}</td><td>${money(m.change)}</td></tr>`
  return `
    <h2>Merchant Daily Balance — ${label}</h2>
    <p>Period: <b>${from}</b> to <b>${to}</b></p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead><tr><th>Merchant</th><th>Entries</th><th>Opening</th><th>To Bank</th><th>Misc</th><th>Closing</th><th>Net Change</th></tr></thead>
      <tbody>${merchants.map(row).join('') || '<tr><td colspan="7">No entries in this period.</td></tr>'}</tbody>
      <tfoot>${row(totals)}</tfoot>
    </table>
    <p style="color:#666;font-size:12px">Full detail is attached as a PDF.</p>`
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })

  const secret = Deno.env.get('REPORT_CRON_SECRET')
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })
  }

  let body: { period?: string } = {}
  try {
    body = await req.json()
  } catch { /* default daily */ }
  const period = body.period === 'weekly' ? 'weekly' : 'daily'
  const { from, to, label } = periodRange(period)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const toEmail = Deno.env.get('REPORT_TO_EMAIL')
  const fromEmail = Deno.env.get('REPORT_FROM_EMAIL')
  if (!supabaseUrl || !serviceKey || !resendKey || !toEmail || !fromEmail) {
    return new Response('Missing env: need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REPORT_TO_EMAIL, REPORT_FROM_EMAIL', { status: 500 })
  }

  const db = createClient(supabaseUrl, serviceKey)
  const { data: rows, error } = await db
    .from('daily_balances')
    .select('merchant_name, balance_date, opening_balance, cash_in, cash_out, misc_expense, bank_amount, closing_balance')
    .gte('balance_date', from)
    .lte('balance_date', to)
    .order('balance_date')
  if (error) return new Response(`Query failed: ${error.message}`, { status: 500 })

  const { merchants, totals } = summarize(rows || [])
  const pdf = await buildPdf(label, from, to, merchants, totals)
  const html = buildHtml(label, from, to, merchants, totals)

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `${label} — ${from}${from === to ? '' : ` to ${to}`} (net change ${money(totals.change)})`,
      html,
      attachments: [{ filename: `balance-${period}-${from}-to-${to}.pdf`, content: toBase64(pdf) }],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    return new Response(`Email failed: ${res.status} ${text}`, { status: 502 })
  }
  return new Response(JSON.stringify({ ok: true, period, from, to, merchants: merchants.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
