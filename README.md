# memora-app

Memora: an adaptive memory layer for early-stage Alzheimer's. This repo is the working app: API, caregiver web app and database schema.

**Prototype. Synthetic data only.** Never load real patient data. Design documents live in the separate `memora` repo.

## Two areas

| URL | Who | What they do |
| --- | --- | --- |
| `/` | Anyone | Chooses an area |
| `/admin` | The Memora team | Creates patient accounts and **does the profiling**: patient file, people, medicines, consent, photos. Connects and changes caregivers. Can read the logs |
| `/caregiver` | Caregivers | Reads the **patient file (read-only)** and logs: log arena, behaviour, logs. Cannot edit the profile |

The split is enforced by the server, not just hidden in the interface.

## Live data

The **Live** tab shows near-real-time readings from three kinds of source:

| Source | What it sends | Needs |
| --- | --- | --- |
| Phone sensors | Movement and location from the phone's browser | Chrome on Android, the `https` address, location permission |
| Bluetooth heart-rate device | Heart rate from a strap or a watch that shares it | Chrome or Edge with Web Bluetooth (not Safari or iPhone) |
| Simulator | Made-up readings, labelled as not a real person | Nothing, a fallback for demos |

Samples go to `POST /api/patients/:id/live/samples` and come back to every open dashboard over a Server-Sent Events stream (`GET /api/patients/:id/live`). `GET .../live/state` returns the last minutes, a plain summary, devices, and how far the phone is from the patient's **places**.

- **Consent first:** wearable data is off by default. The Memora team switches it on under Consent. Turning it off deletes all live samples and devices.
- **Tier 0:** live samples are never read by the question-answering code or sent to a model. A test checks this.
- **Places:** the team adds Home and other places with coordinates under Places (there is a "use my current location" button). The Live tab shows "At Home" or "120 m from Home".
- **Not real health data in the demo:** use a volunteer's own device with their agreement, never a patient's.
- Google Fit is not used: its APIs are closed to new apps and end in 2026.

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
