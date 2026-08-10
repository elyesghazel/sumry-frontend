# Sumry — web dashboard

The landscape counterpart to the [mobile app](https://git.elyesghazel.ch/sumry/app):
a desktop dashboard over the same [API](https://git.elyesghazel.ch/sumry/backend).
Live at <https://sumry.elyesghazel.ch>.

Logging transactions is the phone's job. This is for looking: balances over time,
where the money goes, how this period compares to the last one.

## Design

The colour system is shared with the app, and it does two separate jobs. The UI palette
is near-monochrome — colour there means one thing, the direction money moved. The
categorical ramp (`--c1`…`--c8`) identifies chart series and is generated in OKLCH and
validated: every hue sits in its mode's lightness band, clears the chroma floor, holds
≥3:1 against its surface, and keeps adjacent pairs separable for normal and
colour-deficient vision. Light mode has its own steps rather than being a flipped dark
mode. There are eight hues and they are never cycled to invent a ninth — past the top
eight, categories fold into a neutral "Other".

Every chart carries a hover layer, because a plot you can't interrogate is a picture.
Both themes are available via the sidebar toggle and persist locally.

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
  api.ts         typed backend client, same contract as the app
  store.tsx      session + data + theme, one context
  analytics.ts   ranges, totals, buckets, breakdowns, balance reconstruction
  charts.tsx     Recharts wrappers bound to the design tokens
  ui.tsx         card, stat, delta, bar row
  styles.css     tokens and layout
  pages/         dashboard, insights, transactions, accounts, login
```

Balance history is reconstructed by undoing transactions backwards from today, because
the API stores current balances rather than historical ones. Anything before the first
recorded transaction is unknown, not zero.
