-- Log arena: rich caregiver observations.
-- One observation = a moment (time) + what it was around (e.g. 30 min after a medicine) + several characteristics,
-- each rated against the person's usual (-2 much worse .. +2 much better) with its own detail.
CREATE TABLE IF NOT EXISTS observations (
  id               BIGSERIAL PRIMARY KEY,
  patient_id       INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
  context_type     TEXT NOT NULL DEFAULT 'none' CHECK (context_type IN ('none','medicine','meal','visit','sleep','outing')),
  context_relation TEXT CHECK (context_relation IN ('before','during','after')),
  minutes_offset   INT CHECK (minutes_offset BETWEEN 0 AND 1440),
  medicine_id      INT REFERENCES medicines(id) ON DELETE SET NULL,
  note             TEXT,
  logged_by        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((context_type = 'none' AND context_relation IS NULL) OR (context_type <> 'none' AND context_relation IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS observations_patient_ts_idx ON observations (patient_id, ts DESC);
CREATE INDEX IF NOT EXISTS observations_ctx_idx ON observations (patient_id, context_type, context_relation);

CREATE TABLE IF NOT EXISTS observation_traits (
  observation_id BIGINT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  trait          TEXT NOT NULL CHECK (trait IN ('mood','alertness','orientation','memory','speech','appetite','energy','agitation','anxiety','mobility','pain','sleepiness','social')),
  vs_usual       SMALLINT NOT NULL CHECK (vs_usual BETWEEN -2 AND 2),
  detail         TEXT,
  PRIMARY KEY (observation_id, trait)
);
