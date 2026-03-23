import {
  BrowserAnalyticsStore,
  createFsPglite,
} from "@powerhousedao/analytics-engine-browser";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import fs from "fs";
import { DateTime } from "luxon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString =
  process.env.PG_CONNECTION_STRING ||
  "postgresql://postgres:password@localhost:5555/analytics";

let postgres: PostgresAnalyticsStore;
let memory: BrowserAnalyticsStore;

beforeAll(async () => {
  // read dump
  const sqlHuge = fs.readFileSync("../benchmarks/data/dump-small.sql", "utf-8");

  // initialize stores
  postgres = new PostgresAnalyticsStore({ connectionString });
  const pgLite = await createFsPglite("compat-test-db");

  memory = new BrowserAnalyticsStore({ pgLite });
  await memory.init();
  await memory.raw(sqlHuge);
});

afterAll(() => {
  postgres.destroy();
  memory.destroy();
});

describe("Stores", () => {
  it("should get matching series from postgres + memory", async () => {
    const query = {
      start: DateTime.fromJSDate(new Date("2023-01-01")),
      end: null,
      currency: AnalyticsPath.fromString("DAI"),
      metrics: ["ProtocolNetOutflow", "PaymentsOnChain"],
      select: {
        budget: [AnalyticsPath.fromString("atlas/scopes/SUP/INC/TCH-001")],
      },
    };

    const pgResults = await postgres.getMatchingSeries(query);
    const memResults = await memory.getMatchingSeries(query);

    // compare
    expect(pgResults.length).toBe(memResults.length);

    // order is deterministic
    for (let i = 0; i < pgResults.length; i++) {
      expect(pgResults[i]).toEqual(memResults[i]);
    }
  });
});
