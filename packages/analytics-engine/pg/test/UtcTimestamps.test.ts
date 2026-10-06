import {
  AnalyticsPath,
  type AnalyticsSeriesQuery,
} from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresAnalyticsStore } from "../src/PostgresAnalyticsStore.js";

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  throw new Error("Missing PG_CONNECTION_STRING");
}

let store: PostgresAnalyticsStore;

const TEST_SOURCE = AnalyticsPath.fromString(
  "test/analytics/UtcTimestamps.spec",
);

// Known UTC instants with a nonzero time of day, so a host-offset shift
// cannot hide behind midnight. On a UTC host these tests pass trivially;
// on any other host they fail if a JS Date crosses into SQL, because
// node-postgres renders Dates as host-local wall clock.
const START = DateTime.utc(2023, 3, 15, 10, 30, 0);
const END = DateTime.utc(2023, 9, 1, 4, 45, 0);

const makeQuery = (end: DateTime | null): AnalyticsSeriesQuery => ({
  start: null,
  end,
  metrics: ["UtcProbe"],
  select: {},
});

beforeAll(async () => {
  store = new PostgresAnalyticsStore({ connectionString });

  await store.clearSeriesBySource(TEST_SOURCE, true);
  await store.addSeriesValue({
    start: START,
    end: END,
    source: TEST_SOURCE,
    value: 100,
    unit: "DAI",
    metric: "UtcProbe",
    dimensions: {},
  });
});

afterAll(async () => {
  await store.clearSeriesBySource(TEST_SOURCE, true);
  store.destroy();
});

it("persists the UTC wall clock into the naive timestamp columns", async () => {
  const result = (await store.raw(
    `select "start"::text as "start", "end"::text as "end"
     from "AnalyticsSeries"
     where "source" = '${TEST_SOURCE.toString("/")}'`,
  )) as { rows: { start: string; end: string }[] };

  expect(result.rows.length).toBe(1);
  expect(result.rows[0].start).toBe("2023-03-15 10:30:00");
  expect(result.rows[0].end).toBe("2023-09-01 04:45:00");
});

it("round-trips the instant through the store API", async () => {
  const series = await store.getMatchingSeries(makeQuery(null));

  expect(series.length).toBe(1);
  expect(series[0].start.toUTC().toISO()).toBe(START.toISO());
  expect(series[0].end?.toUTC().toISO()).toBe(END.toISO());
});

it("compares the end bound in UTC regardless of its zone", async () => {
  // The same instant as START, expressed in a non-UTC zone. The window is
  // half-open (start < end), so a bound at exactly START must exclude the
  // row; rendering the bound in its own zone's wall clock would include it.
  const excluded = await store.getMatchingSeries(
    makeQuery(START.setZone("Europe/Brussels")),
  );
  expect(excluded.length).toBe(0);

  const included = await store.getMatchingSeries(
    makeQuery(START.plus({ seconds: 1 }).setZone("Europe/Brussels")),
  );
  expect(included.length).toBe(1);
});
