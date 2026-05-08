-- One-off fix: enforce the invariant that CREATE_DOCUMENT and UPGRADE_DOCUMENT
-- (both always in document scope) carry timestamps strictly before every other
-- op on the same documentId, across all scopes.
--
-- The synthetic source data violates this: child content ops carry hardcoded
-- timestamps like 2026-04-03T12:00:00Z, while CREATE_DOCUMENT/UPGRADE_DOCUMENT
-- use the actual server write time (2026-05-07T16:35:...). The reshuffle path
-- in the executor compares timestamps to detect conflicts on receive, so this
-- inversion causes spurious reshuffle when a client pulls split batches.
--
-- For each documentId:
--   min_other_ts = min(timestampUtcMs) across ALL ops whose action.type is
--                  neither CREATE_DOCUMENT nor UPGRADE_DOCUMENT.
--   CREATE_DOCUMENT.ts  = min_other_ts - 2 ms
--   UPGRADE_DOCUMENT.ts = min_other_ts - 1 ms
-- This preserves CREATE_DOCUMENT < UPGRADE_DOCUMENT < everything else.
--
-- Updates two tables atomically:
--   reactor."Operation"                (timestampUtcMs is timestamptz)
--   reactor.operation_index_operations (timestampUtcMs is text ISO-8601)
-- The action JSONB carries a copy of timestampUtcMs; we update that too.
--
-- Hashes are NOT recomputed. The system stores hashes but does not verify
-- them at read time, so leaving them stale is acceptable for this one-off.

\set ON_ERROR_STOP on

BEGIN;

SET search_path TO reactor;

-- Per documentId, the minimum timestamp of any op that isn't a
-- CREATE_DOCUMENT or UPGRADE_DOCUMENT.
CREATE TEMP TABLE fix_targets ON COMMIT DROP AS
SELECT
  "documentId",
  MIN("timestampUtcMs") AS min_other_ts
FROM "Operation"
WHERE action->>'type' NOT IN ('CREATE_DOCUMENT', 'UPGRADE_DOCUMENT')
GROUP BY "documentId";

\echo '--- Operation rows that will be updated (CREATE_DOCUMENT) ---'
SELECT count(*) AS rows_to_update
FROM "Operation" o
JOIN fix_targets t USING ("documentId")
WHERE o.action->>'type' = 'CREATE_DOCUMENT'
  AND o."timestampUtcMs" >= t.min_other_ts - interval '2 milliseconds';

\echo '--- Operation rows that will be updated (UPGRADE_DOCUMENT) ---'
SELECT count(*) AS rows_to_update
FROM "Operation" o
JOIN fix_targets t USING ("documentId")
WHERE o.action->>'type' = 'UPGRADE_DOCUMENT'
  AND o."timestampUtcMs" >= t.min_other_ts - interval '1 millisecond';

UPDATE "Operation" o
SET
  "timestampUtcMs" = t.min_other_ts - interval '2 milliseconds',
  action = jsonb_set(
    o.action,
    '{timestampUtcMs}',
    to_jsonb(to_char(
      (t.min_other_ts - interval '2 milliseconds') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ))
  )
FROM fix_targets t
WHERE o."documentId" = t."documentId"
  AND o.action->>'type' = 'CREATE_DOCUMENT';

UPDATE "Operation" o
SET
  "timestampUtcMs" = t.min_other_ts - interval '1 millisecond',
  action = jsonb_set(
    o.action,
    '{timestampUtcMs}',
    to_jsonb(to_char(
      (t.min_other_ts - interval '1 millisecond') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ))
  )
FROM fix_targets t
WHERE o."documentId" = t."documentId"
  AND o.action->>'type' = 'UPGRADE_DOCUMENT';

UPDATE operation_index_operations o
SET
  "timestampUtcMs" = to_char(
    (t.min_other_ts - interval '2 milliseconds') AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  action = jsonb_set(
    o.action,
    '{timestampUtcMs}',
    to_jsonb(to_char(
      (t.min_other_ts - interval '2 milliseconds') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ))
  )
FROM fix_targets t
WHERE o."documentId" = t."documentId"
  AND o.action->>'type' = 'CREATE_DOCUMENT';

UPDATE operation_index_operations o
SET
  "timestampUtcMs" = to_char(
    (t.min_other_ts - interval '1 millisecond') AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  action = jsonb_set(
    o.action,
    '{timestampUtcMs}',
    to_jsonb(to_char(
      (t.min_other_ts - interval '1 millisecond') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ))
  )
FROM fix_targets t
WHERE o."documentId" = t."documentId"
  AND o.action->>'type' = 'UPGRADE_DOCUMENT';

\echo '--- Documents where invariant is still violated (should be 0) ---'
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
WHERE o.action->>'type' IN ('CREATE_DOCUMENT', 'UPGRADE_DOCUMENT')
  AND to_char(o."timestampUtcMs" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> i."timestampUtcMs";

COMMIT;
