-- One-off fix: enforce STRICTLY monotonic timestampUtcMs by index within
-- each (documentId, scope, branch).
--
-- Background: the synthetic source data has within-scope inversions, e.g. for
-- documentId fa22d387 the global scope has CREATE_MOC at index 0 with ts
-- 2026-04-03T15:00:00Z and ADD_CORE_IDEA at indices 1..N with ts
-- 2026-04-03T14:39:25Z. The receiving reactor's getConflicting(ts) uses
-- "timestampUtcMs >= minIncomingTs", so any stored op whose ts equals or
-- exceeds an incoming op's ts is counted as conflicting -> reshuffle.
-- Reshuffle re-emits ops with empty sourceRemote, looping them back into
-- the source's outbox.
--
-- We need STRICT monotonicity: every op at index i must have
--   ts[i] > ts[k] for all k < i in the same (documentId, scope, branch).
-- Otherwise sibling ops sharing a ts trip the >= check.
--
-- Strategy:
--   For each (documentId, scope, branch) ordered by index ascending,
--     row_idx = ROW_NUMBER() - 1   (0-indexed within partition)
--     new_ts[i] = MAX(orig_ts[k] - k * 1ms for k in 0..i) + i * 1ms
--   This is the closed-form of "running max with carry": each row gets its
--   original ts unless a prior row's running new_ts already reached it, in
--   which case it gets prev_new_ts + 1ms.
--   Only rows where new_ts > old_ts are written back.
--
-- The CREATE_DOCUMENT / UPGRADE_DOCUMENT precedence established by the prior
-- fix-create-timestamps.sql is preserved: doc-scope create ops have the
-- smallest ts per documentId, and this script only ever increases timestamps
-- in scopes other than the one CREATE_DOCUMENT lives in (or leaves them
-- unchanged). It also leaves CREATE_DOCUMENT/UPGRADE_DOCUMENT untouched,
-- since they sit at index 0 and 1 of doc scope with strictly increasing ts.
--
-- Updates two tables atomically:
--   reactor."Operation"                (timestampUtcMs is timestamptz)
--   reactor.operation_index_operations (timestampUtcMs is text ISO-8601)
-- The action JSONB carries a copy of timestampUtcMs; we update that too.
--
-- Hashes are NOT recomputed (read path does not verify them).

\set ON_ERROR_STOP on

BEGIN;

SET search_path TO reactor;

-- Compute desired new timestamp per row using a "strictly monotonic running
-- max" within (documentId, scope, branch) ordered by index.
--
-- Closed form:
--   row_idx = ROW_NUMBER() - 1
--   new_ts[i] = MAX(orig_ts[k] - k*1ms for k <= i) + i*1ms
CREATE TEMP TABLE fix_monotonic ON COMMIT DROP AS
WITH numbered AS (
  SELECT
    "documentId",
    scope,
    branch,
    index,
    "timestampUtcMs" AS old_ts,
    (ROW_NUMBER() OVER (
      PARTITION BY "documentId", scope, branch ORDER BY index
    ) - 1) AS row_idx
  FROM "Operation"
)
SELECT
  "documentId",
  scope,
  branch,
  index,
  old_ts,
  (
    MAX(old_ts - (row_idx * interval '1 millisecond')) OVER (
      PARTITION BY "documentId", scope, branch
      ORDER BY index
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
  ) + (row_idx * interval '1 millisecond') AS new_ts
FROM numbered;

CREATE TEMP TABLE fix_apply ON COMMIT DROP AS
SELECT *
FROM fix_monotonic
WHERE new_ts > old_ts;

\echo '--- Operation rows that will be updated ---'
SELECT count(*) AS rows_to_update FROM fix_apply;

\echo '--- Breakdown by scope ---'
SELECT scope, count(*) FROM fix_apply GROUP BY scope ORDER BY count(*) DESC;

UPDATE "Operation" o
SET
  "timestampUtcMs" = f.new_ts,
  action = jsonb_set(
    o.action,
    '{timestampUtcMs}',
    to_jsonb(to_char(
      f.new_ts AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ))
  )
FROM fix_apply f
WHERE o."documentId" = f."documentId"
  AND o.scope = f.scope
  AND o.branch = f.branch
  AND o.index = f.index;

UPDATE operation_index_operations o
SET
  "timestampUtcMs" = to_char(
    f.new_ts AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  action = jsonb_set(
    o.action,
    '{timestampUtcMs}',
    to_jsonb(to_char(
      f.new_ts AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ))
  )
FROM fix_apply f
WHERE o."documentId" = f."documentId"
  AND o.scope = f.scope
  AND o.branch = f.branch
  AND o.index = f.index;

\echo '--- Strict-monotonic violations remaining (should be 0) ---'
WITH ranked AS (
  SELECT
    "documentId", scope, branch, index, "timestampUtcMs",
    LAG("timestampUtcMs") OVER (
      PARTITION BY "documentId", scope, branch ORDER BY index
    ) AS prev_ts
  FROM "Operation"
)
SELECT count(*) AS violations
FROM ranked
WHERE prev_ts IS NOT NULL AND "timestampUtcMs" <= prev_ts;

\echo '--- CREATE_DOCUMENT/UPGRADE_DOCUMENT precedence still holds (should be 0 violations) ---'
SELECT count(*) AS violations
FROM (
  SELECT
    "documentId",
    MAX("timestampUtcMs") FILTER (WHERE action->>'type' IN ('CREATE_DOCUMENT', 'UPGRADE_DOCUMENT')) AS max_create_ts,
    MIN("timestampUtcMs") FILTER (WHERE action->>'type' NOT IN ('CREATE_DOCUMENT', 'UPGRADE_DOCUMENT')) AS min_other_ts
  FROM "Operation"
  GROUP BY "documentId"
) g
WHERE max_create_ts IS NOT NULL
  AND min_other_ts IS NOT NULL
  AND max_create_ts >= min_other_ts;

\echo '--- Cross-table consistency check (should be 0 mismatches) ---'
SELECT count(*) AS mismatches
FROM "Operation" o
JOIN operation_index_operations i
  ON i."documentId" = o."documentId"
 AND i.scope = o.scope
 AND i.branch = o.branch
 AND i.index = o.index
WHERE to_char(o."timestampUtcMs" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> i."timestampUtcMs";

COMMIT;
