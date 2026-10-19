# Migration: naive timestamp columns are now read and written as UTC

`KnexAnalyticsStore` stores `start` and `end` in naive `timestamp` columns.
Earlier versions bound JS `Date` values, which node-postgres serializes as
host-local wall clock, and parsed reads back as host-local. That was
self-consistent on a single host, but the stored values depended on the
writing host's timezone, and they disagreed with the (UTC) convention of
`BrowserAnalyticsStore`.

As of this version, the store writes the UTC wall clock and reads the columns
back as UTC, matching `BrowserAnalyticsStore`.

Consequences for existing data:

- Rows written by earlier versions on a non-UTC host are stored shifted by
  that host's UTC offset at write time. After this change those rows are read
  as UTC and therefore shift by the old host's offset (for example, a row
  written at 10:00 UTC on a UTC+2 host was stored as 12:00 and now reads back
  as 12:00 UTC).
- A deployment that always ran on UTC hosts (the common server case) stored
  UTC wall clock all along and is unaffected.
- For other deployments, the correction is a one-time `UPDATE` shifting the
  affected rows by the known historical offset, for example:

  ```sql
  UPDATE "AnalyticsSeries"
  SET "start" = "start" - interval '2 hours',
      "end"   = "end"   - interval '2 hours';
  ```

  Only the operator knows the historical offset (and whether it varied with
  daylight saving or spans rows from multiple hosts), so this correction is
  deliberately not automated.
