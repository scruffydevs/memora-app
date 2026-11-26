-- Memora core schema. Synthetic data only until the Gate, consent and hosting are reviewed.
-- pgvector is optional for now: if the database does not offer it, search still works (keywords).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available, skipping: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS patients (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id           SERIAL PRIMARY KEY,
  patient_id   INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  relationship TEXT,
  mention      TEXT,                          -- "what to mention"
  enrolled     BOOLEAN NOT NULL DEFAULT FALSE, -- only enrolled people may ever be recognised (planned)
  last_seen    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS places (
  id         SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  lat        DOUBLE PRECISION,                -- Tier 0
  lon        DOUBLE PRECISION,                -- Tier 0
  radius_m   INT NOT NULL DEFAULT 100,
  private    BOOLEAN NOT NULL DEFAULT FALSE   -- capture switches off here (planned)
);

CREATE TABLE IF NOT EXISTS medicines (
  id         SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  dose       TEXT,
  schedule   TEXT
);

-- Notes, transcript segments, captures. tier: 0 never leaves the vault, 1 masked, 2 as written.
CREATE TABLE IF NOT EXISTS entries (
  id         BIGSERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL,
  text       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','voice','glasses','import')),
  tier       SMALLINT NOT NULL DEFAULT 1 CHECK (tier IN (0,1,2)),
  place_id   INT REFERENCES places(id) ON DELETE SET NULL,
  search     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Embedding column only if pgvector exists. Filled by a LOCAL embedding model later, never a third-party API for real data.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding vector(384);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS entries_patient_ts_idx ON entries (patient_id, ts DESC);
CREATE INDEX IF NOT EXISTS entries_search_idx ON entries USING GIN (search);

CREATE TABLE IF NOT EXISTS entry_contacts (
  entry_id   BIGINT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  contact_id INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, contact_id)
);

CREATE TABLE IF NOT EXISTS signals (
  id         BIGSERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('sleep_hours','steps','heart_rate','mood')),
  value      DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_patient_kind_ts_idx ON signals (patient_id, kind, ts);

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  patient_id  INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ts          TIMESTAMPTZ NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('visit','dose_taken','dose_missed','exit','repeated_question','note')),
  contact_id  INT REFERENCES contacts(id) ON DELETE SET NULL,
  place_id    INT REFERENCES places(id) ON DELETE SET NULL,
  medicine_id INT REFERENCES medicines(id) ON DELETE SET NULL,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS events_patient_ts_idx ON events (patient_id, ts DESC);

-- Every call that leaves the vault is logged here: the receipt.
CREATE TABLE IF NOT EXISTS receipts (
  id           BIGSERIAL PRIMARY KEY,
  patient_id   INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  question     TEXT NOT NULL,
  entry_ids    BIGINT[] NOT NULL DEFAULT '{}',
  masked_count INT NOT NULL DEFAULT 0,
  provider     TEXT NOT NULL,
  outbound     TEXT NOT NULL,   -- the exact text sent (already masked)
  dry_run      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS receipts_patient_ts_idx ON receipts (patient_id, ts DESC);
