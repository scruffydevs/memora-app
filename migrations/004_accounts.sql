-- Accounts: caregivers sign in with their own account and connect to a patient with a one-time code.
-- Patient accounts are created by an admin (the Memora team). History stays with the patient when caregivers change.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,          -- stored lower-case
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- scrypt, never the password
  role          TEXT NOT NULL CHECK (role IN ('admin','caregiver')),
  disabled      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

-- Opaque session tokens. Only a SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_code TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE patients SET patient_code = 'MP-' || upper(substr(md5(random()::text || id::text), 1, 6)) WHERE patient_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS patients_code_idx ON patients (patient_code);

-- Who is connected to which patient, and for how long. Ending a connection never deletes history.
CREATE TABLE IF NOT EXISTS patient_connections (
  id           SERIAL PRIMARY KEY,
  patient_id   INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','secondary')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  ended_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS conn_one_active_idx ON patient_connections (patient_id, caregiver_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS conn_one_primary_idx ON patient_connections (patient_id) WHERE status = 'active' AND role = 'primary';

-- One-time connection codes. Only a hash is stored; the code is shown once when created.
CREATE TABLE IF NOT EXISTS connection_codes (
  id         SERIAL PRIMARY KEY,
  code_hash  TEXT NOT NULL UNIQUE,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','secondary')),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_by    INT REFERENCES users(id) ON DELETE SET NULL,
  used_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  patient_id INT REFERENCES patients(id) ON DELETE SET NULL,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS audit_ts_idx ON audit_log (ts DESC);

-- Authorship, so the next caregiver can see who wrote what.
ALTER TABLE care_logs ADD COLUMN IF NOT EXISTS author_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS author_id INT REFERENCES users(id) ON DELETE SET NULL;

-- Patient file: care essentials a new caregiver needs on day one.
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS emergency_name TEXT;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS emergency_phone TEXT;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS clinician_name TEXT;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS clinic TEXT;
