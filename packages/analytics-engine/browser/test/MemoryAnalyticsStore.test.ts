import { DateTime } from "luxon";
import {
  type AnalyticsDimension,
  AnalyticsPath,
} from "@powerhousedao/analytics-engine-core";
import { MemoryAnalyticsStore } from "../src/MemoryAnalyticsStore.js";
import { afterAll, beforeAll, it, expect } from "vitest";
import { defaultQueryLogger } from "@powerhousedao/analytics-engine-knex";

let store: MemoryAnalyticsStore;

const TEST_SOURCE = AnalyticsPath.fromString(
  "test/analytics/AnalyticsStore.spec",
);

beforeAll(async () => {
  store = new MemoryAnalyticsStore({
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
