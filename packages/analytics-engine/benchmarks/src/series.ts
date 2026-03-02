import fs from "fs";
import { DateTime } from "luxon";
import { Bench } from "tinybench";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import { logs } from "./util.js";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";
import { MemoryAnalyticsStore } from "@powerhousedao/analytics-engine-browser";

const isPgDisabled = process.env.PG_DISABLED === "true";
const connectionString = process.env.PG_CONNECTION_STRING;
if (!isPgDisabled && !connectionString) {
  throw new Error(
    "PG_CONNECTION_STRING not set. Either set it or run with PG_DISABLED=true",
  );
}

const postgres = isPgDisabled
  ? null
  : new PostgresAnalyticsStore({ connectionString });
if (postgres) {
  console.log(`Postgres initialized and connecting to ${connectionString}.`);
}

const sqlHuge = fs.readFileSync("./data/dump-huge.sql", "utf-8");
const memory = new MemoryAnalyticsStore();
await memory.init();
await memory.raw(sqlHuge);

console.log("Memory initialized.");

const query = {
  start: DateTime.fromJSDate(new Date("2023-01-01")),
  end: null,
  currency: AnalyticsPath.fromString("DAI"),
  metrics: ["ProtocolNetOutflow", "PaymentsOnChain"],
  select: {
    budget: [AnalyticsPath.fromString("atlas/scopes/SUP/INC/TCH-001")],
  },
};

let bench = new Bench({ warmup: true });

if (!isPgDisabled) {
  bench = bench.add(
    "PG",
    async () => {
      await postgres!.getMatchingSeries(query);
    },
    logs("PG"),
  );
}

bench.add(
  "Memory",
  async () => {
    await memory.getMatchingSeries(query);
  },
  logs("Memory"),
);

await bench.run();

console.table(bench.table());

postgres?.destroy();
memory.destroy();
