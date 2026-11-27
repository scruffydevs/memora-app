-- Live signals: near-real-time samples from a phone's sensors, a Bluetooth heart-rate device, or a simulator.
-- Raw live samples are Tier 0 (never sent to any model). Withdrawing wearable consent deletes them.

ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS consent_wearables BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS devices (
  id         SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('phone_sensors','ble_heart_rate','simulator','google_health')),
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ,
  UNIQUE (patient_id, kind, label)
);

-- Live samples reuse the signals table. Add the new kinds and a link to the device.
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_kind_check;
ALTER TABLE signals ADD CONSTRAINT signals_kind_check CHECK (kind IN ('sleep_hours','steps','heart_rate','mood','motion','lat','lon'));
ALTER TABLE signals ADD COLUMN IF NOT EXISTS device_id INT REFERENCES devices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS signals_live_idx ON signals (patient_id, ts DESC) WHERE device_id IS NOT NULL;
