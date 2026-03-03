import { DateTime } from "luxon";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import {
  AnalyticsPath,
  AnalyticsQueryEngine,
  AnalyticsGranularity,
  type AnalyticsQuery,
  type GroupedPeriodResults,
} from "@powerhousedao/analytics-engine-core";
import { MemoryAnalyticsStore } from "../src/MemoryAnalyticsStore.js";

let store: MemoryAnalyticsStore;
let engine: AnalyticsQueryEngine;

const TEST_SOURCE = AnalyticsPath.fromString("test/analytics/Integration.spec");

const getResultsForGranularity = async (
  granularity: AnalyticsGranularity,
  start: DateTime,
  end: DateTime,
): Promise<GroupedPeriodResults> => {
  const query: AnalyticsQuery = {
    start,
    end,
    granularity,
    metrics: ["Budget"],
    currency: AnalyticsPath.fromString("DAI"),
    select: {
      budget: [AnalyticsPath.fromString("atlas/legacy/core-units/PE-001")],
      category: [AnalyticsPath.fromString("atlas/headcount")],
      project: [TEST_SOURCE],
    },
    lod: {
      budget: 3,
      category: 2,
      project: 2,
    },
  };

  const result = await engine.execute(query);
  return result;
};

beforeAll(async () => {
  store = new MemoryAnalyticsStore();
  await store.init();

  engine = new AnalyticsQueryEngine(store);

  // clear all records first
  await store.clearSeriesBySource(TEST_SOURCE, true);

  // budget
  await store.addSeriesValues([
    {
      start: DateTime.utc(2021, 1, 1),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/FrontEndEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
    {
      start: DateTime.utc(2022, 1, 1),
      source: TEST_SOURCE,
      value: 10000,
      unit: "DAI",
      metric: "budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/FrontEndEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
    {
      start: DateTime.utc(2023, 1, 1),
      source: TEST_SOURCE,
      value: 15000,
      unit: "DAI",
      metric: "budget",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/SmartContractEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
    {
      start: DateTime.utc(2022, 1, 1),
      end: DateTime.utc(2023, 1, 1),
      source: TEST_SOURCE,
      value: 240,
      unit: "MKR",
      metric: "Budget",
      fn: "DssVest",
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/SmartContractEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
    {
      start: DateTime.utc(2023, 1, 1),
      end: DateTime.utc(2024, 1, 1),
      source: TEST_SOURCE,
      value: 240,
      unit: "MKR",
      metric: "budget",
      fn: "DssVest",
      params: {
        cliff: DateTime.utc(2023, 12, 1),
      },
      dimensions: {
        budget: AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
        category: AnalyticsPath.fromString(
          "atlas/headcount/CompensationAndBenefits/SmartContractEngineering",
        ),
        project: TEST_SOURCE,
      },
    },
  ]);

  // add fte's
  await store.addSeriesValues([
    {
      start: DateTime.utc(2023, 1, 1),
      source: TEST_SOURCE,
      value: 5.8,
      metric: "FTEs",
      dimensions: {
        project: TEST_SOURCE,
      },
    },
    {
      start: DateTime.utc(2023, 3, 1),
      source: TEST_SOURCE,
      value: -0.8,
      metric: "FTEs",
      dimensions: {
        project: TEST_SOURCE,
      },
    },
  ]);
});

afterAll(async () => {
  store.destroy();
});

it("should query records", async () => {
  const query: AnalyticsQuery = {
    start: DateTime.utc(2022, 9, 1),
    end: null,
    granularity: AnalyticsGranularity.Total,
    metrics: ["Budget", "Actuals", "FTEs"],
    currency: AnalyticsPath.fromString("DAI,MKR"),
    select: {
      budget: [
        AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
        AnalyticsPath.fromString("atlas/legacy/core-units/PE-001"),
      ],
      category: [AnalyticsPath.fromString("atlas/headcount")],
      project: [TEST_SOURCE],
    },
    lod: {
      budget: 3,
      category: 2,
      project: 2,
    },
  };

  const result = await engine.execute(query);

  expect(result.length).toBe(1);
  expect(result[0].rows.map((r) => r.unit).sort()).toEqual(["DAI", "MKR"]);
  expect(result[0].rows.map((r) => r.dimensions.budget.path)).toEqual([
    "atlas/legacy/core-units",
    "atlas/legacy/core-units",
  ]);
});

describe("totals of different granularities", () => {
  const start = DateTime.utc(2022, 1, 1);
  const end = DateTime.utc(2023, 6, 1);

  it("should return one, correct row on total granularity", async () => {
    const result = await getResultsForGranularity(
      AnalyticsGranularity.Total,
      start,
      end,
    );

    expect(result.length).toBe(1);
    expect(result[0].rows[0].sum).toBe(35000);
    expect(result[0].rows[0].value).toBe(15000);
    expect(result[0].period).toBe("total");
  });

  it("should correct value on annual granularity", async () => {
    const result = await getResultsForGranularity(
      AnalyticsGranularity.Annual,
      DateTime.utc(2021, 1, 1),
      end,
    );

    expect(result.length).toBe(3);

    const result2021 = result.find((r) => r.period === "2021");
    expect(result2021).toBeDefined();
    expect(result2021?.rows[0].value).toBe(10000);

    const result2022 = result.find((r) => r.period === "2022");
    expect(result2022).toBeDefined();
    expect(result2022?.rows[0].value).toBe(15000);

    const result2023 = result.find((r) => r.period === "2023");
    expect(result2023).toBeDefined();
    expect(result2023?.rows[0].value).toBe(0);
  });

  /*
  it("should correct sum up on semi annual granularity", async () => {
    const result = await getResultsForGranularity(
      AnalyticsGranularity.SemiAnnual
    );
    expect(result.length).toBe(3);
    expect(getTotalSumOfResults(result)).toBe(total);
    expect(result[result.length - 1].rows[0].sum).toBe(25000);
    expect(result[result.length - 1].period).toBe("2023/H1");
  });

  it("should correct sum up on monthly granularity", async () => {
    const result = await getResultsForGranularity(AnalyticsGranularity.Monthly);
    expect(result.length).toBe(17);
    expect(getTotalSumOfResults(result)).toBe(total);
    expect(result[result.length - 1].rows[0].sum).toBe(25000);
    expect(result[0].period).toBe("2022/1");
  });

  it("should correct sum up on weekly granularity", async () => {
    const result = await getResultsForGranularity(AnalyticsGranularity.Weekly);
    expect(result.length).toBe(75);
    expect(getTotalSumOfResults(result)).toBe(total);
    expect(result[result.length - 1].rows[0].sum).toBe(25000);
    expect(result[0].period).toBe("2021/W52");
  });

  it("should correct sum up on daily granularity", async () => {
    const start = DateTime.utc(2021, 12, 30);
    const end = DateTime.utc(2022, 1, 5);
    const result = await getResultsForGranularity(
      AnalyticsGranularity.Daily,
      start,
      end
    );
    expect(result.length).toBe(6);
    expect(result[result.length - 1].rows[0].sum).toBe(10000);
    expect(result[0].period).toBe("2021/12/30");
  });

  it("should correct sum up on hourly granularity", async () => {
    const start = DateTime.utc(2021, 12, 31);
    const end = DateTime.utc(2022, 1, 1, 5);
    const result = await getResultsForGranularity(
      AnalyticsGranularity.Hourly,
      start,
      end
    );
    expect(result.length).toBe(6);
    expect(result[result.length - 1].rows[0].sum).toBe(10000);
    expect(result[0].period).toBe("2021/12/31/23");
  });
  */
});

describe("dss vesting", () => {
  it("should return values linear proportional to the time passed", async () => {
    const start = DateTime.utc(2023, 1, 1);
    const end = DateTime.utc(2024, 1, 1);
    const query: AnalyticsQuery = {
      start,
      end,
      granularity: AnalyticsGranularity.Monthly,
      metrics: ["Budget", "Actuals"],
      currency: AnalyticsPath.fromString("MKR"),
      select: {
        budget: [AnalyticsPath.fromString("atlas/legacy/core-units/PE-001")],
        category: [
          AnalyticsPath.fromString(
            "atlas/headcount/CompensationAndBenefits/SmartContractEngineering",
          ),
        ],
        project: [TEST_SOURCE],
      },
      lod: {
        budget: 3,
        category: 2,
        project: 2,
      },
    };

    const result = await engine.execute(query);

    // should give us 12 periods, one for each month
    expect(result.length).toBe(12);
    const january = result[0].rows[0];
    const november = result[10].rows[0];
    const december = result[11].rows[0];

    expect(january.value).toBe(0);
    expect(november.value.toFixed(0)).toBe("220"); // vest everything until cliff date
    expect(december.value.toFixed(0)).toBe("20"); // vest normal amount
  });

  it("should return vesting if start and end date > query date", async () => {
    const start = DateTime.utc(2022, 3, 1);
    const end = DateTime.utc(2022, 6, 1);
    const query: AnalyticsQuery = {
      start,
      end,
      granularity: AnalyticsGranularity.Monthly,
      metrics: ["Budget", "Actuals"],
      currency: AnalyticsPath.fromString("MKR"),
      select: {
        budget: [AnalyticsPath.fromString("atlas/legacy/core-units/PE-001")],
        category: [
          AnalyticsPath.fromString(
            "atlas/headcount/CompensationAndBenefits/SmartContractEngineering",
          ),
        ],
        project: [TEST_SOURCE],
      },
      lod: {
        budget: 3,
        category: 2,
        project: 2,
      },
    };

    const result = await engine.execute(query);
    expect(result.length).toBe(3);
    const feb = result[0].rows[0];
    const march = result[1].rows[0];
    const april = result[2].rows[0];

    expect(feb.value.toFixed(0)).toBe("20");
    expect(march.sum).toBe(feb.sum + march.value);
    expect(april.sum).toBe(march.sum + april.value);
  });
});
