# Daily Net Balance

A React and Vite app for tracking merchant wallets and recording daily closing balances. Supabase handles authentication and data storage.

## Run locally

Use Node.js 22.12 or later. From the repository root:

```sh
cd app
npm ci
```

For sign-in and database access, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `app/.env.local` for your Supabase project. Use the public anon key, never a service-role key: Vite includes `VITE_` variables in browser code.

Run `npm run dev` from `app/` and open the URL printed by Vite. To check changes locally, run `npm run lint` and `npm run build` from the same directory.

## GitHub Pages

The live app is at <https://wallet.bachagallu.in/>. The [Pages workflow](.github/workflows/pages.yml) builds `app/` and publishes `app/dist/` on pushes to `main`. It reads the two Supabase settings above from GitHub Actions secrets. Check **Actions > Deploy to GitHub Pages** for the deployment result.
