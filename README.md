# memora-app

Memora: an adaptive memory layer for early-stage Alzheimer's. This repo is the working app: API, caregiver web app and database schema.

**Prototype. Synthetic data only.** Never load real patient data. Design documents live in the separate `memora` repo.

## How accounts work

1. The Memora team (admin) signs in and **creates the patient account**. It gets a patient code like `MP-4F7K2X`.
2. The admin generates a **one-time connection code** (valid 7 days, stored only as a hash).
3. The caregiver **creates their own account**, signs in, and enters the code. That connects them, and the patient's dashboard opens.
4. A caregiver sees **only** the patients they are actively connected to. Every API request is checked.
5. When caregivers change, the admin (or the caregiver) ends the connection. **History stays with the patient**: the next caregiver sees the profile, logs and who wrote what.

Passwords use scrypt, sessions are httpOnly cookies, logins are rate limited, and connections, codes and resets are written to an audit log.

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
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates the first admin (the Memora team) on start, only if that email does not exist yet. Password needs 10+ characters |
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
npm test             # access-rule tests against an in-memory Postgres (no database needed)
```

Reset a password: `EMAIL=someone@example.com NEW_PASSWORD='a long password' npm run set-password`

For web development: `npm --prefix web run dev` (proxies `/api` to `http://localhost:3000`).

## Deploy

Build command `npm run build`, start command `npm start`. The API serves the built web app, so one app is enough.

## Principles

Descriptive, never diagnostic. Photos are encrypted, consent-gated and not used for recognition. Anything sent to a model goes through the Gate, is masked, and is logged as a receipt.
