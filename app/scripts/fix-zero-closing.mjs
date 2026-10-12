// One-off fix: rows where end-of-day was saved as 0 but opening was non-zero.
// Sets closing_balance = opening_balance so the change shows 0 (wallet unchanged).
// Run: node scripts/fix-zero-closing.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim()))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { data: rows, error: selErr } = await supabase
  .from('daily_balances')
  .select('id, merchant_name, balance_date, opening_balance, closing_balance')
  .eq('closing_balance', 0)
  .gt('opening_balance', 0)

if (selErr) {
  console.error('Select failed:', selErr.message)
  process.exit(1)
}

console.log(`Found ${rows.length} row(s) to fix`)
for (const r of rows) {
  const { error } = await supabase
    .from('daily_balances')
    .update({ closing_balance: r.opening_balance })
    .eq('id', r.id)
  if (error) console.error(`  ${r.id}: ${error.message}`)
  else console.log(`  fixed: ${r.merchant_name} ${r.balance_date} closing -> ${r.opening_balance}`)
}
