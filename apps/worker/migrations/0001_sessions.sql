-- Finished sessions (decision log D-006, amended by D-008).
--
-- One row per completed session. `log_gzip` is the whole JSONL event stream,
-- gzipped, as the same format that also drives the replay viewer and the
-- Archive's ghosts (doc 05 section 7): one artifact, three consumers.
--
-- The point of D1 over an object store is that the benchmark can ask
-- relational questions directly -- "every session on seed 7 across all
-- backends", "completion rate on vandalised Chamber I seeds" -- as one query
-- against the indexed columns, rather than a list-and-fetch loop over
-- individually named objects. `log_gzip` is opaque to those queries by
-- design: it is read back only when a specific session's full log is wanted,
-- for example by the replay viewer.
--
-- Applied with:
--   npx wrangler d1 execute semaphore-sessions --file=migrations/0001_sessions.sql            (local dev)
--   npx wrangler d1 execute semaphore-sessions --remote --file=migrations/0001_sessions.sql    (production)

CREATE TABLE IF NOT EXISTS sessions (
  session_id        TEXT    PRIMARY KEY,
  seed              TEXT    NOT NULL,
  designation       TEXT    NOT NULL,
  difficulty        TEXT    NOT NULL,
  mode              TEXT    NOT NULL,
  outcome           TEXT    NOT NULL,   -- 'escaped' | 'abandoned' | 'deadlocked'
  chambers_cleared  INTEGER NOT NULL,
  started_at_ms     INTEGER NOT NULL,
  ended_at_ms       INTEGER NOT NULL,
  median_latency_ms INTEGER NOT NULL,
  stamina_window_ms INTEGER NOT NULL,
  log_gzip          BLOB    NOT NULL
);

-- The benchmark's most common query: every session for a given seed, so a
-- model's runs on that puzzle can be compared against every other model's.
CREATE INDEX IF NOT EXISTS idx_sessions_seed ON sessions (seed);

-- The ablation's query: completion rate by outcome and difficulty.
CREATE INDEX IF NOT EXISTS idx_sessions_outcome ON sessions (outcome, difficulty);
