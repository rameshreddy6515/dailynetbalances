// WhatsApp chat entry — webhook for the Meta WhatsApp Cloud API.
//
// Message grammar (all case-insensitive):
//   list                        -> list merchant names
//   status                      -> today's per-merchant change + wallet total
//   help                        -> usage
//   <merchant> <closing>        -> record today's end-of-day amount
//   <merchant> <closing> b<amt> -> also record Move to Bank
//   <merchant> <closing> m<amt> -> also record Misc Expense
// Examples: "sharma 15230"  "sharma 15230 b2000"  "sharma 15,230 b2,000 m150"
//
// Opening balance is carried from the merchant's previous closing, matching
// the app's behavior. If an entry already exists for today, it is updated.
// Entries get tags = ['whatsapp'].
//
// Only numbers in WHATSAPP_ALLOWED_NUMBERS (comma-separated, e.g.
// "919876543210") may record entries.
//
// Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt
// Secrets:  WHATSAPP_VERIFY_TOKEN (random string you choose),
//           WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ALLOWED_NUMBERS
// Setup steps are in README.md next to this file.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const toNum = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const changeOf = (r: Record<string, unknown>): number =>
  toNum(r.closing_balance) - toNum(r.opening_balance) + toNum(r.cash_out) + toNum(r.misc_expense) + toNum(r.bank_amount)
const money = (v: number): string => `Rs ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(v)}`
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const HELP = [
  'Commands:',
  '• list — show merchants',
  '• status — today\'s summary',
  '• <merchant> <closing> — save end-of-day amount',
  '• add b<amt> for Move to Bank, m<amt> for Misc',
  'e.g. sharma 15230 b2000 m150',
].join('\n')

interface Env {
  db: ReturnType<typeof createClient>
  token: string
  phoneId: string
  allowed: Set<string>
}

function getEnv(): Env | string {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const allowed = new Set(
    (Deno.env.get('WHATSAPP_ALLOWED_NUMBERS') || '').split(',').map((s) => s.trim()).filter(Boolean)
  )
  if (!url || !key || !token || !phoneId || !allowed.size) {
    return 'Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ALLOWED_NUMBERS'
  }
  return { db: createClient(url, key), token, phoneId, allowed }
}

async function reply(env: Env, to: string, body: string) {
  await fetch(`https://graph.facebook.com/v21.0/${env.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  })
}

function matchMerchant(merchants: string[], name: string): { hit?: string; options?: string[] } {
  const q = name.toLowerCase()
  const exact = merchants.find((m) => m.toLowerCase() === q)
  if (exact) return { hit: exact }
  const partial = merchants.filter((m) => m.toLowerCase().includes(q))
  if (partial.length === 1) return { hit: partial[0] }
  return { options: partial.length ? partial : merchants }
}

async function handleCommand(env: Env, from: string, text: string): Promise<string> {
  const { db } = env
  const cmd = text.trim()

  if (/^(help|hi|hello|start|\?)$/i.test(cmd)) return HELP

  const { data: mRows, error: mErr } = await db.from('merchants').select('merchant_name').order('merchant_name')
  if (mErr) return `Could not load merchants: ${mErr.message}`
  const merchants = (mRows || []).map((m) => m.merchant_name as string)

  if (/^list$/i.test(cmd)) return merchants.length ? `Merchants:\n${merchants.map((m) => `• ${m}`).join('\n')}` : 'No merchants yet.'

  if (/^(status|today|summary)$/i.test(cmd)) {
    const { data: rows, error } = await db.from('daily_balances').select('*').eq('balance_date', today())
    if (error) return `Could not load today: ${error.message}`
    if (!rows?.length) return 'No entries recorded today.'
    const lines = rows.map((r) => `• ${r.merchant_name}: ${changeOf(r) >= 0 ? '+' : '−'}${money(Math.abs(changeOf(r)))}`)
    const total = rows.reduce((t, r) => t + changeOf(r), 0)
    return [`Today (${today()}):`, ...lines, `Total: ${total >= 0 ? '+' : '−'}${money(Math.abs(total))}`].join('\n')
  }

  // Entry: <merchant name words> <closing> [b<amt>] [m<amt>]
  const tokens = cmd.split(/\s+/).map((t) => t.replaceAll(',', ''))
  let bank = 0
  let misc = 0
  const rest: string[] = []
  for (const t of tokens) {
    const suf = t.match(/^([bm])(\d+(?:\.\d+)?)$/i)
    if (suf) {
      if (suf[1].toLowerCase() === 'b') bank = toNum(suf[2])
      else misc = toNum(suf[2])
    } else rest.push(t)
  }
  const closingIdx = rest.findIndex((t) => /^\d+(?:\.\d+)?$/.test(t))
  if (closingIdx < 0) return `Could not find a closing amount.\n\n${HELP}`
  const closing = toNum(rest[closingIdx])
  const name = rest.filter((_, i) => i !== closingIdx).join(' ').trim()
  if (!name) return `Missing merchant name.\n\n${HELP}`

  const match = matchMerchant(merchants, name)
  if (!match.hit) {
    return match.options?.length
      ? `No exact match for "${name}". Did you mean:\n${match.options.slice(0, 8).map((m) => `• ${m}`).join('\n')}`
      : `No merchants found.`
  }

  const day = today()
  const { data: existing } = await db
    .from('daily_balances')
    .select('*')
    .eq('merchant_name', match.hit)
    .eq('balance_date', day)
    .order('created_at', { ascending: false })
    .limit(1)

  if (existing?.length) {
    const row = existing[0]
    const patch: Record<string, unknown> = { closing_balance: closing }
    if (bank) patch.bank_amount = bank
    if (misc) patch.misc_expense = misc
    const { error } = await db.from('daily_balances').update(patch).eq('id', row.id)
    if (error) return `Update failed: ${error.message}`
    const ch = changeOf({ ...row, ...patch })
    return `Updated ${match.hit} — closing ${money(closing)}. Today's change: ${ch >= 0 ? '+' : '−'}${money(Math.abs(ch))}`
  }

  const { data: prevRows } = await db
    .from('daily_balances')
    .select('closing_balance')
    .eq('merchant_name', match.hit)
    .lt('balance_date', day)
    .order('balance_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  let opening = toNum(prevRows?.[0]?.closing_balance)
  if (!prevRows?.length) {
    const { data: merch } = await db.from('merchants').select('initial_balance').eq('merchant_name', match.hit).limit(1)
    opening = toNum(merch?.[0]?.initial_balance)
  }

  const record = {
    merchant_name: match.hit,
    balance_date: day,
    opening_balance: opening,
    closing_balance: closing,
    bank_amount: bank,
    misc_expense: misc,
    entry_type: 'daily',
    tags: ['whatsapp'],
  }
  const { error } = await db.from('daily_balances').insert(record)
  if (error) return `Save failed: ${error.message}`
  const ch = changeOf(record)
  const moves = [bank ? ` bank ${money(bank)}` : '', misc ? ` misc ${money(misc)}` : ''].join('')
  return `Saved ${match.hit} — opening ${money(opening)}, closing ${money(closing)}${moves}. Today's change: ${ch >= 0 ? '+' : '−'}${money(Math.abs(ch))}`
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Meta webhook verification handshake
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge || '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const env = getEnv()
  if (typeof env === 'string') return new Response(env, { status: 500 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Acknowledge immediately; process messages without blocking the 200.
  const work = (async () => {
    try {
      for (const entry of (body.entry as Record<string, unknown>[]) || []) {
        for (const change of (entry.changes as Record<string, unknown>[]) || []) {
          const value = change.value as Record<string, unknown>
          for (const msg of (value?.messages as Record<string, unknown>[]) || []) {
            if (msg.type !== 'text') continue
            const from = String(msg.from || '')
            const text = String((msg.text as Record<string, unknown>)?.body || '')
            if (!env.allowed.has(from)) {
              await reply(env, from, 'This number is not allowed to record entries.')
              continue
            }
            await reply(env, from, await handleCommand(env, from, text))
          }
        }
      }
    } catch (e) {
      console.error('webhook error', e)
    }
  })()
  // @ts-ignore EdgeRuntime is available in Supabase edge functions
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  else await work

  return new Response('OK', { status: 200 })
})
