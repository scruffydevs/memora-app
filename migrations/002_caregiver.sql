-- Caregiver section: patient profile (character), behaviour and care logs, consented photos.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_noted BOOLEAN NOT NULL DEFAULT FALSE;

-- Who the person is. Written with the patient wherever possible.
CREATE TABLE IF NOT EXISTS patient_profiles (
  patient_id            INT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  preferred_name        TEXT,
  language              TEXT,
  age_band              TEXT,                       -- e.g. "70s". No exact birth date needed.
  background            TEXT,                       -- life story, work, family, what matters
  traits                TEXT[] NOT NULL DEFAULT '{}', -- character: "gentle", "private", "loves jokes"
  likes                 TEXT[] NOT NULL DEFAULT '{}',
  dislikes              TEXT[] NOT NULL DEFAULT '{}',
  calming               TEXT[] NOT NULL DEFAULT '{}', -- what helps when distressed
  triggers              TEXT[] NOT NULL DEFAULT '{}', -- what tends to upset
  communication         TEXT,                       -- how to talk with them
  routine               TEXT,                       -- a usual day
  consent_photos        BOOLEAN NOT NULL DEFAULT FALSE,
  consent_caregiver_view BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One timeline for everything a caregiver notes. kind = 'behaviour' uses category and severity.
CREATE TABLE IF NOT EXISTS care_logs (
  id           BIGSERIAL PRIMARY KEY,
  patient_id   INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind         TEXT NOT NULL CHECK (kind IN ('behaviour','medicine','meal','visit','incident','note')),
  category     TEXT CHECK (category IN ('sleep','mood','agitation','wandering','eating','confusion','repeated_question','social','other')),
  severity     SMALLINT CHECK (severity BETWEEN 1 AND 5),
  trigger_text TEXT,           -- what seemed to set it off
  helped       TEXT,           -- what helped
  text         TEXT NOT NULL,
  logged_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_logs_patient_ts_idx ON care_logs (patient_id, ts DESC);
CREATE INDEX IF NOT EXISTS care_logs_patient_kind_ts_idx ON care_logs (patient_id, kind, ts DESC);

-- Tier 0. Photos are encrypted by the app (AES-256-GCM) before they reach the database.
-- Stored only after consent. NOT used for face recognition: matching is planned, and unverified.
CREATE TABLE IF NOT EXISTS photos (
  id         BIGSERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE CASCADE,  -- NULL = the patient
  label      TEXT,
  mime       TEXT NOT NULL,
  iv         BYTEA NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_patient_idx ON photos (patient_id);
