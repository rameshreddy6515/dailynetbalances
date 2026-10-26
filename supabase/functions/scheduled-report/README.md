# scheduled-report Edge Function

Emails a daily or weekly PDF summary of `daily_balances` via [Resend](https://resend.com).

## Deploy

```bash
# from the repo root, after `supabase login` and `supabase link --project-ref <ref>`
supabase functions deploy scheduled-report --no-verify-jwt
```

`--no-verify-jwt` is required because the cron caller authenticates with a shared
secret instead of a user JWT.

## Secrets

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  REPORT_TO_EMAIL=you@example.com \
  REPORT_FROM_EMAIL="DailyNet <reports@your-verified-domain.com>" \
  REPORT_CRON_SECRET=$(openssl rand -hex 24)
```

`REPORT_FROM_EMAIL` must use a domain verified in Resend (or use
`onboarding@resend.dev` for testing).

## Schedule

Run the commented pg_cron block at the bottom of `supabase.sql` in the SQL
editor, replacing `<PROJECT_REF>` and `<REPORT_CRON_SECRET>`.

## Manual test

```bash
curl -X POST \
  "https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-report" \
  -H "Authorization: Bearer <REPORT_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"period":"daily"}'
```

Body: `{"period": "daily"}` reports yesterday; `{"period": "weekly"}` reports
the last 7 completed days.
