-- Memora Core, milestone 1: the memory store.
-- A memory is one short statement about one patient with a validity period, a privacy tier and its sources.
-- Superseded versions are kept on purpose (so "what was true then" can be answered). Retracting blanks the words.

CREATE TABLE IF NOT EXISTS memories (
  id            BIGSERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('fact','preference','routine','relationship','observation','event')),
  predicate     TEXT NOT NULL,
  subject_type  TEXT NOT NULL DEFAULT 'patient' CHECK (subject_type IN ('patient','contact','place','medicine')),
  subject_id    INT,
  text          TEXT NOT NULL,
  tier          SMALLINT NOT NULL CHECK (tier IN (0,1,2)),   -- 0 never leaves the vault, 1 masked, 2 as written
  confidence    REAL NOT NULL DEFAULT 0.9 CHECK (confidence BETWEEN 0 AND 1),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','retracted')),
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to      TIMESTAMPTZ,
  supersedes_id BIGINT REFERENCES memories(id),
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  search        TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
  -- an embedding column is added in milestone 3, only if pgvector exists
);
CREATE INDEX IF NOT EXISTS memories_patient_status_idx ON memories (patient_id, status, kind);
CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING GIN (search);
CREATE INDEX IF NOT EXISTS memories_supersedes_idx ON memories (supersedes_id);

-- Where each memory came from. "manual" sources carry a stated reason in note.
CREATE TABLE IF NOT EXISTS memory_sources (
  id           BIGSERIAL PRIMARY KEY,
  memory_id    BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL CHECK (source_table IN ('profile','observations','care_logs','entries','manual')),
  source_id    BIGINT,
  tier         SMALLINT NOT NULL DEFAULT 1 CHECK (tier IN (0,1,2)),  -- the source's own tier; a memory is never less strict
  note         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_sources_unique_idx ON memory_sources (memory_id, source_table, COALESCE(source_id, 0));
CREATE INDEX IF NOT EXISTS memory_sources_lookup_idx ON memory_sources (source_table, source_id);

-- Who did what, when. Details never contain the memory's words, so they can stay after a retract.
CREATE TABLE IF NOT EXISTS memory_events (
  id        BIGSERIAL PRIMARY KEY,
  memory_id BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  action    TEXT NOT NULL,   -- created, superseded, closed, retracted
  actor     TEXT NOT NULL,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS memory_events_memory_idx ON memory_events (memory_id, ts);
