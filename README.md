# Shift Tracker

A web app for tracking work shifts across multiple jobs and calculating Australian casual earnings — pay rules, loadings, overtime, and a take-home estimate after tax. Built for the Australia/Adelaide timezone.

Local-first: it works fully offline with no account. Cloud sync is optional and off unless configured.

Live: https://shift-tracker-nu.vercel.app

## Features

- **Multi-job pay rules**: separate morning/night rates, configurable weekend and public holiday loadings, casual loading, tiered overtime (daily and weekly thresholds), and superannuation.
- **Cash-in-hand income**: mark a job as non-taxable — it's tracked and shown separately from taxable income and never included in the tax estimate.
- **AU tax estimate**: fortnightly/weekly take-home pay estimate using resident tax brackets, the Low Income Tax Offset, and the Medicare levy.
- **Calendar and list views** for logging and reviewing shifts, with a full worked-calculation breakdown per shift.
- **Reports**: weekly/fortnightly earnings by job, an earnings-over-time chart, and CSV export.
- **Dark mode** (light/dark/system) and an installable PWA for iPhone/Android home screens.

## Data & privacy

All data is written first to IndexedDB in the browser (Dexie.js), and the app is fully usable with no account and no network.

Cloud sync activates only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set — without them `cloudEnabled` is false and no Supabase client is ever constructed. When it is enabled and you sign in, local writes queue into an outbox and drain to Supabase, while remote changes are pulled with a per-user cursor, so the app keeps working through a dropped connection and reconciles afterwards.

## How the pay engine works

Australian casual pay has more edge cases than it looks. A single shift can cross the morning/night rate boundary, land on a public holiday, push the day over a daily overtime threshold *and* push the week over a weekly one — and the loadings interact.

All of that lives in `src/lib/payCalculation/`, isolated from the UI and covered by unit tests. The app never recomputes pay in a component; every view calls the engine and renders a full worked breakdown, so any number shown can be traced back to the rule that produced it. The tax estimate is separate again, in `src/lib/tax/`, implementing resident brackets, the Low Income Tax Offset and the Medicare levy.

`npm test` runs 35 tests across the pay engine, reporting, and the tax calculation.

## Tech stack

React + TypeScript + Vite, Tailwind CSS, Dexie.js (IndexedDB), Supabase (optional sync), date-fns-tz, Recharts, vite-plugin-pwa.

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # run the pay calculation engine's unit tests
npm run build    # production build
```

## Deployment

Deployed on Vercel. To redeploy after changes:

```bash
npx vercel --prod
```
