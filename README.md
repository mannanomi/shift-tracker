# Shift Tracker

A personal web app for tracking work shifts across multiple jobs and calculating earnings — built for South Australia (Australia/Adelaide timezone), fully local, no backend, no login.

Live: https://shift-tracker-nu.vercel.app

## Features

- **Multi-job pay rules**: separate morning/night rates, configurable weekend and public holiday loadings, casual loading, tiered overtime (daily and weekly thresholds), and superannuation.
- **Cash-in-hand income**: mark a job as non-taxable — it's tracked and shown separately from taxable income and never included in the tax estimate.
- **AU tax estimate**: fortnightly/weekly take-home pay estimate using resident tax brackets, the Low Income Tax Offset, and the Medicare levy.
- **Calendar and list views** for logging and reviewing shifts, with a full worked-calculation breakdown per shift.
- **Reports**: weekly/fortnightly earnings by job, an earnings-over-time chart, and CSV export.
- **Dark mode** (light/dark/system) and an installable PWA for iPhone/Android home screens.

## Data & privacy

All data is stored locally in the browser via IndexedDB (Dexie.js). Nothing is sent to a server — there's no account, no login, and no backend.

## Tech stack

React + TypeScript + Vite, Tailwind CSS, Dexie.js, date-fns, Recharts.

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
