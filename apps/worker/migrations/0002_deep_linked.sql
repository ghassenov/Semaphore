-- Mark the sessions that were handed their chambers (decision log D-059).
--
-- `?chamber=N` fast-forwards a fresh session to a later chamber so a judge can
-- be shown the Blind Panel without solving two rooms first. The reducer already
-- records that on the session as `deepLinked`, and says why in its own words:
-- "the benchmark's corpus, the ablation and any future leaderboard all read
-- finished sessions out of D1, and a session that was handed three solved
-- chambers is not evidence about a pair."
--
-- It never reached D1. There was no column for it, `SessionStartEvent` has no
-- field for it either, so it was not recoverable from the gzipped log, and the
-- insert had no gate. A deep-linked escape therefore landed in the corpus as
-- `outcome='escaped'` with `chambers_cleared=4` - counting the CHAMBER_SOLVED
-- events the fast-forward itself raised - and no consumer could tell it from a
-- session a pair had actually played. The flag existed and protected nothing.
--
-- Nullable-with-a-default rather than a rebuild: every row written before this
-- migration was written by a path that could not deep link, so 0 is not a guess
-- about those rows, it is the truth about them.
ALTER TABLE sessions ADD COLUMN deep_linked INTEGER NOT NULL DEFAULT 0;

-- The corpus is queried for evidence, so the thing that disqualifies a row from
-- being evidence belongs in the index that finds it.
DROP INDEX IF EXISTS idx_sessions_outcome;
CREATE INDEX IF NOT EXISTS idx_sessions_outcome
  ON sessions (outcome, difficulty, deep_linked);
