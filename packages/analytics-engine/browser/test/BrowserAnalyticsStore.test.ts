import { PGlite } from "@electric-sql/pglite";
import {
  type AnalyticsDimension,
  AnalyticsPath,
  defaultQueryLogger,
} from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BrowserAnalyticsStore } from "../src/BrowserAnalyticsStore.js";

let store: BrowserAnalyticsStore;

const TEST_SOURCE = AnalyticsPath.fromString(
  "test/analytics/AnalyticsStore.spec",
);

beforeAll(async () => {
  const pgLite = await PGlite.create();
  store = new BrowserAnalyticsStore({
    pgLite,
    queryLogger: defaultQueryLogger("memory"),
  });
  await store.init();

  await store.addSeriesValues([
    {
      start: DateTime.utc(),
      end: null,
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "Budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/FrontEndEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
    {
      start: DateTime.utc(),
      end: DateTime.utc(2024, 1, 1),
      source: TEST_SOURCE,
      value: 210,
      unit: "MKR",
      metric: "Budget",
      fn: "DssVest",
      params: {
        cliff: DateTime.utc(2023, 11, 1),
      },
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/SES-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/SmartContractEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
  ]);

  await store.addSeriesValue({
    start: DateTime.utc(2023, 1, 1),
    end: null,
    source: TEST_SOURCE,
    value: 5.8,
    metric: "FTEs",
    dimensions: {
      project: TEST_SOURCE,
    },
  });

  await store.addSeriesValue({
    start: DateTime.utc(2023, 3, 1),
    end: null,
    source: TEST_SOURCE,
    value: -0.8,
    metric: "FTEs",
    dimensions: {
      project: TEST_SOURCE,
    },
  });
});

afterAll(async () => {
  store.destroy();
});

it("should query records", async () => {
  const results = await store.getMatchingSeries({
    start: null,
    end: null,
    currency: AnalyticsPath.fromString("MKR,DAI"),
    metrics: ["Actuals", "Budget", "FTEs"],
    select: {
      budget: [AnalyticsPath.fromString("atlas/legacy/core-units/SES-001")],
      category: [
        AnalyticsPath.fromString("atlas/headcount"),
        AnalyticsPath.fromString("atlas/non-headcount"),
      ],
      project: [TEST_SOURCE],
    },
  });

  expect(results.length).toBe(2);
  expect(results.map((r) => r.unit)).toEqual(["DAI", "MKR"]);

  expect(
    results.map((r) =>
      (r.dimensions.budget as AnalyticsDimension).path.toString(),
    ),
  ).toEqual([
    "atlas/legacy/core-units/SES-001",
    "atlas/legacy/core-units/SES-001",
  ]);
});

it("should query records without currency filter", async () => {
  const results = await store.getMatchingSeries({
    start: null,
    end: null,
    metrics: ["Actuals", "Budget", "FTEs"],
    select: {
      budget: [AnalyticsPath.fromString("atlas/legacy/core-units/SES-001")],
      category: [
        AnalyticsPath.fromString("atlas/headcount"),
        AnalyticsPath.fromString("atlas/non-headcount"),
      ],
      project: [TEST_SOURCE],
    },
  });

  expect(results.length).toBe(2);
  expect(results.map((r) => r.unit).sort()).toEqual(["DAI", "MKR"]);
});
