import {
  BrowserAnalyticsStore,
  createFsPglite,
} from "@powerhousedao/analytics-engine-browser";
import fs from "fs";
import { Bench } from "tinybench";
import { logs } from "./util.js";

// first, load the data
const sqlSmall = fs.readFileSync("./data/dump-small.sql", "utf-8");
const sqlHuge = fs.readFileSync("./data/dump-huge.sql", "utf-8");

let store: BrowserAnalyticsStore;
const bench = new Bench({
  time: 500,
  warmup: true,
});

console.log("Initializing benchmarks...");

bench
  .add(
    "Init",
    async () => {
      const pgLite = await createFsPglite(`test-db-${Date.now().toString()}`);
      const initStore = new BrowserAnalyticsStore({ pgLite });
      await initStore.init();
      await initStore.destroy();
    },
    logs("Init"),
  )
  .add(
    "Insert (100 records)",
    async () => {
      await store.raw(sqlSmall);
    },
    logs("Insert (100 records)", {
      beforeEach: async () => {
        const pgLite = await createFsPglite(`test-db-${Date.now().toString()}`);
        store = new BrowserAnalyticsStore({ pgLite });
        await store.init();
      },
      afterEach: async () => {
        await store.destroy();
      },
    }),
  )
  .add(
    "Insert (200k records)",
    async () => {
      await store.raw(sqlHuge);
    },
    logs("Insert (200k records)", {
      beforeEach: async () => {
        const pgLite = await createFsPglite(`test-db-${Date.now().toString()}`);
        store = new BrowserAnalyticsStore({ pgLite });
        await store.init();
      },
      afterEach: async () => {
        await store.destroy();
      },
    }),
  )
  .add(
    "Select Distinct",
    async () => {
      await store.raw(`select distinct unit from "AnalyticsSeries"`);
    },
    logs("Select Distinct", {
      beforeAll: async () => {
        const pgLite = await createFsPglite(`test-db-${Date.now().toString()}`);
        store = new BrowserAnalyticsStore({ pgLite });
        await store.init();
        await store.raw(sqlHuge);
      },
      afterAll: async () => {
        await store.destroy();
      },
    }),
  );

await bench.run();

console.table(bench.table());
