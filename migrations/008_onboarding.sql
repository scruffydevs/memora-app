-- Patient onboarding: the answers from the card sequence, and the portfolio written from them.
-- The portfolio is a draft until the Memora team approves it; only an approved portfolio is shown to carers.

CREATE TABLE IF NOT EXISTS patient_intake (
  patient_id   INT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL DEFAULT '{}',
  step         INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT
);

CREATE TABLE IF NOT EXISTS patient_portfolios (
  id          SERIAL PRIMARY KEY,
  patient_id  INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  version     INT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','discarded')),
  content     JSONB NOT NULL,
  provider    TEXT NOT NULL,                  -- 'template' or 'openrouter'
  model       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  UNIQUE (patient_id, version)
);
CREATE INDEX IF NOT EXISTS patient_portfolios_idx ON patient_portfolios (patient_id, version DESC);
