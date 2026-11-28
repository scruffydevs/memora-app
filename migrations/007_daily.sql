-- Daily health numbers from a watch, read on the phone through Health Connect and sent by the Memora Android app.
-- One row per patient per day. Syncing the same day again updates the row.
-- Withdrawing wearable consent deletes these rows (same switch as live data).

CREATE TABLE IF NOT EXISTS daily_metrics (
  id             SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  day            DATE NOT NULL,                 -- the day the person woke up (sleep) or the calendar day (everything else)
  sleep_minutes  INT,
  deep_minutes   INT,
  rem_minutes    INT,
  light_minutes  INT,
  awake_minutes  INT,
  awakenings     INT,
  sleep_start    TIMESTAMPTZ,
  sleep_end      TIMESTAMPTZ,
  steps          INT,
  active_kcal    INT,
  resting_hr     INT,
  avg_hr         INT,
  hrv_ms         INT,
  spo2_avg       REAL,
  source         TEXT NOT NULL DEFAULT 'health_connect' CHECK (source IN ('health_connect','seed','manual')),
  source_name    TEXT,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, day)
);
CREATE INDEX IF NOT EXISTS daily_metrics_day_idx ON daily_metrics (patient_id, day DESC);

-- The phone app is a device too.
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_kind_check;
ALTER TABLE devices ADD CONSTRAINT devices_kind_check CHECK (kind IN ('phone_sensors','ble_heart_rate','simulator','google_health','health_connect'));
