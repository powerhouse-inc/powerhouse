import { DateTime } from "luxon";
import {
  type AnalyticsDimension,
  AnalyticsPath,
} from "@powerhousedao/analytics-engine-core";
import { BrowserAnalyticsStore } from "../src/BrowserAnalyticsStore.js";

import { afterAll, beforeAll, it, expect, describe } from "vitest";

const TEST_SOURCE = AnalyticsPath.fromString(
  "test/analytics/AnalyticsStore.spec",
);

const dbName = "analytics.db";

const deleteIdbDb = (name: string) =>
  new Promise((res, rej) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.onsuccess = res;
    req.onerror = rej;
  });

beforeAll(async () => {});

afterAll(async () => {
  //
});

describe("IDB VFS", () => {
  it("should persist records on disk", { timeout: 10000000 }, async () => {
    // first, delete db
    await deleteIdbDb(dbName);

    const store = new BrowserAnalyticsStore({ databaseName: dbName });
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

    const newStore = new BrowserAnalyticsStore({ databaseName: dbName });
    await newStore.init();

    const results = await newStore.getMatchingSeries({
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

  it("should handle giant inputs", { timeout: 10000000 }, async () => {
    // load sql dump
    const res = await fetch(
      `http://localhost:${window.location.port}/dump-small.sql`,
    );
    const sql = await res.text();

    // delete existing db
    await deleteIdbDb("analytics.db.huge");

    const store = new BrowserAnalyticsStore({
      databaseName: "analytics.db.huge",
    });
    await store.init();

    console.log("Executing SQL...", sql);

    performance.mark("start");
    await store.raw(sql);
    performance.mark("end");

    const results = await store.raw(
      `select count(*) as count from "AnalyticsDimension"`,
    );

    const count = results[0].count;
    const duration = performance.measure("duration", "start", "end");

    console.log(`Loaded ${count} records in ${duration.duration}ms.`);
  });
});
