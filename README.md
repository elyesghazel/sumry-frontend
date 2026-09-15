# Sumry — web dashboard

The landscape counterpart to the [mobile app](https://git.elyesghazel.ch/sumry/app):
a desktop dashboard over the same [API](https://git.elyesghazel.ch/sumry/backend).
Live at <https://sumry.elyesghazel.ch>.

Logging transactions is the phone's job. This is for looking: balances over time,
where the money goes, how this period compares to the last one.

## Design

The ledger: paper, ink and hairlines. Figures are set in Fraunces with optical sizing,
everything else in Inter with tabular numerals. The interface itself is near-monochrome —
colour means the direction money moved, plus an eight-step earth-tone ramp that identifies
chart series and is never cycled to invent a ninth. Light is the primary palette; dark is
its own set, not an inversion, and follows the system unless overridden. Density has two
steps (comfortable / compact) that change spacing only.

Every chart carries a hover layer, because a plot you can't interrogate is a picture.

## What it does

- **Home** — safe to spend before the next planned income, month-end forecast, upcoming
  items, budgets at a glance, balance and breakdown for the chosen period.
- **Activity** — the full ledger, filtered and paged on the server with totals for the
  whole match; every row opens the editor.
- **Accounts** — balances (with foreign currencies converted), sparklines, transfers,
  reconciliation ("Adjust" books the difference rather than overwriting).
- **Budgets** — per-category envelopes with a period, a start day (payday) and rollover;
  progress shows pace against elapsed time, not just the total.
- **Plan** — planned transactions (rent, salary, savings transfers) with one-click or
  automatic booking, savings goals, and subscriptions detected from history.
- **Insights** — flow Sankey, pace vs previous period, weekday rhythm, daily heatmap,
  per-category trends, year over year.
- **Settings** — categorisation rules (with dry-run recategorisation of history),
  statement import for PostFinance and Revolut CSVs with duplicate detection, CSV/JSON
  export, the monthly statement, categories, password and sessions.
- **Quick add** (⌘K) — `12.50 kebab cash yesterday`, `got 300 lohn`,
  `500 from pf to sparkonto`, `netflix 17.90 #Abos`; parsed live, booked on Enter.
- Installs as a PWA and accepts shared text into quick add.

## Running it

```bash
npm install
npm run dev            # VITE_API_URL overrides the API, defaults to production
```

## Deploying

Built and served by nginx behind Traefik, as `web-sumry`. `VITE_API_URL` is baked in at
image build time, so changing it means rebuilding:

```bash
docker compose up -d --build
```

The API must list this origin in `SUMRY_CORS_ALLOWED_ORIGINS`, otherwise the browser
blocks every request.

## Layout

```
src/
  api.ts             typed backend client, same contract as the app
  store.tsx          session, preferences, data domains, hash routing, toasts
  analytics.ts       ranges, totals, buckets, breakdowns, sankey, heatmap, yoy
  charts.tsx         Recharts wrappers bound to the design tokens
  ui.tsx             section, stat, animated number, delta, modal, controls
  styles.css         tokens and layout
  components/        top bar + quick add, editors
  pages/             home, activity, accounts, budgets, plan, insights, settings, login
public/
  manifest.webmanifest, sw.js   PWA shell (the API is never cached)
```

Reports add up in the base currency: each transaction carries the value it had in CHF
when it was booked. Balance history is reconstructed by undoing transactions backwards
from today, because the API stores current balances rather than historical ones.
