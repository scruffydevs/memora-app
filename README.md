# memora-app

Memora: an adaptive memory layer for early-stage Alzheimer's. This repo is the working app: API, caregiver web app and database schema.

**Prototype. Synthetic data only.** Never load real patient data. Design documents live in the separate `memora` repo.

## What exists

- **Caregiver section** (web app): patient profile (who they are, character, what helps, triggers), people with consent-based photos, behaviour log with a descriptive summary, care logs, and a privacy and consent page.
- **API** (Node, Express, PostgreSQL): profile, people, logs, behaviour summary, encrypted photos, notes, and a first version of the privacy gateway ("the Gate") with receipts.
- **Not built:** face recognition, the clinician report, voice and glasses capture, the baseline model.

## Layout

```
src/         API (Express)
migrations/  SQL migrations, run automatically on start
scripts/     seed.js (synthetic persona), leaktest.js
web/         React + Tailwind caregiver app (built to web/dist, served by the API)
```

## Configuration (environment variables)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `ACCESS_TOKEN` | Shared access code for `/api` and the web login (strongly recommended on any public URL) |
| `PHOTO_ENC_KEY` | 64 hex characters. Encrypts stored photos (AES-256-GCM). Without it, photo upload is refused |
| `DEEPSEEK_API_KEY` | Optional, for Ask Memora. Synthetic data only |
| `PORT` | HTTP port (default 3000) |
| `DATABASE_SSL` | `true` if the database requires SSL |

Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Never commit `.env`.

## Run

```
npm install
npm run build        # installs and builds web/ into web/dist
npm start            # runs migrations, then serves API and web
npm run seed         # loads the synthetic persona (8 weeks of life, planted change)
npm run leaktest     # checks no names, places or dates would leave the vault
```

For web development: `npm --prefix web run dev` (proxies `/api` to `http://localhost:3000`).

## Deploy

Build command `npm run build`, start command `npm start`. The API serves the built web app, so one app is enough.

## Principles

Descriptive, never diagnostic. Photos are encrypted, consent-gated and not used for recognition. Anything sent to a model goes through the Gate, is masked, and is logged as a receipt.
