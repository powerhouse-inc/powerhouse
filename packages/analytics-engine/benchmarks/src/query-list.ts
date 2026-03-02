import fs from "fs";
import { DateTime } from "luxon";
import { MemoryAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import {
  AnalyticsGranularity,
  AnalyticsPath,
  AnalyticsProfiler,
  AnalyticsQueryEngine,
} from "@powerhousedao/analytics-engine-core";
import {
  PostgresAnalyticsStore,
  reviver,
} from "@powerhousedao/analytics-engine-pg";

class ExecutionResults {
  public readonly durationMs: number;

  constructor(
    public readonly name: string,
    durationMs: number,
  ) {
    this.durationMs = durationMs;
  }
}

function loadQueries() {
  const raw = JSON.parse(fs.readFileSync("./data/query-list.json", "utf-8"));

  return raw.map(({ query }: { query: any }) => ({
    start: DateTime.fromISO(query.start),
    end: query.end ? DateTime.fromISO(query.end) : null,
    metrics: query.metrics,
    currency: query.currency ? reviver(null, query.currency) : undefined,
    granularity: query.granularity as AnalyticsGranularity,
    lod: query.lod,
    select: Object.keys(query.select).reduce(
      (acc, key) =>
        (acc[key] = query.select[key].map((value: any) =>
          reviver(null, value),
        )),
      {} as Record<string, AnalyticsPath[]>,
    ),
  }));
}

type AggregateEntry = { [i: string]: number };
type AggregateResults = { pg: AggregateEntry; memory: AggregateEntry };

function aggregate(results: ExecutionResults[]) {
  const totals: AggregateEntry = {
    total: 0,
  };
  for (const result of results) {
    const { name, durationMs } = result;
    const split = name.split(".");
    const op = split[split.length - 1];

    if (!totals[op]) {
      totals[op] = 0;
    }

    totals[op] += durationMs;
    totals.total += durationMs;
  }

  return totals;
}

function deepEquals(a: any, b: any) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      throw new Error(`Mismatch: ${a} is array but ${b} is not`);
    }

    if (a.length !== b.length) {
      throw new Error(
        `Mismatch: ${a} length ${a.length} !== ${b} length ${b.length}`,
      );
    }

    for (let i = 0; i < a.length; i++) {
      deepEquals(a[i], b[i]);
    }
  } else if (typeof a === "object") {
    if (typeof b !== "object") {
      throw new Error(`Mismatch: ${a} is object but ${b} is not`);
    }

    for (const key in a) {
      if (!(key in b)) {
        throw new Error(`Mismatch: ${a} has key ${key} that ${b} does not`);
      }

      deepEquals(a[key], b[key]);
    }
  } else {
    if (a !== b) {
      throw new Error(`Mismatch: ${a} !== ${b}`);
    }
  }
}

// validate
const isPgDisabled = process.env.PG_DISABLED === "true";
const connString = process.env.PG_CONNECTION_STRING;
if (!isPgDisabled && !connString) {
  throw new Error(
    "PG_CONNECTION_STRING not set. Either set it or run with PG_DISABLED=true",
  );
}

// first, load the data
const sqlHuge = fs.readFileSync("./data/dump-huge.sql", "utf-8");

// next, load the queries
const queries = loadQueries();

// prep profiling tools
const memoryResults: ExecutionResults[] = [];
const pgResults: ExecutionResults[] = [];
const memoryProfiler = new AnalyticsProfiler("memory", (name, durationNano) =>
  memoryResults.push(new ExecutionResults(name, durationNano)),
);
const pgProfiler = isPgDisabled
  ? undefined
  : new AnalyticsProfiler("pg", (name, durationNano) =>
      pgResults.push(new ExecutionResults(name, durationNano)),
    );

// stores
const memory: MemoryAnalyticsStore = new MemoryAnalyticsStore({
  profiler: memoryProfiler,
});
await memory.init();
await memory.raw(sqlHuge);

// clear post-insert
memoryResults.length = 0;
const memoryEngine = new AnalyticsQueryEngine(memory, memoryProfiler);

const pg = isPgDisabled
  ? null
  : new PostgresAnalyticsStore({
      connectionString: connString!,
      profiler: pgProfiler,
    });
const pgEngine = isPgDisabled
  ? null
  : new AnalyticsQueryEngine(pg!, pgProfiler!);

const allMemoryResults = [];
const allPgResults = [];
const rawResults: AggregateResults[] = [];
for (let i = 0; i < queries.length; i++) {
  // perform queries
  const query = queries[i];

  memoryProfiler.push(i.toString());
  const memoryValues = await memoryEngine.execute(query);
  memoryProfiler.pop();

  if (pgProfiler && pgEngine) {
    pgProfiler.push(i.toString());
    const pgValues = await pgEngine.execute(query);
    pgProfiler.pop();

    // validate that they are the same
    deepEquals(memoryValues, pgValues);
  }

  // pull results
  const mem = memoryResults.concat();
  memoryResults.length = 0;

  const pg = pgResults.concat();
  pgResults.length = 0;

  allMemoryResults.push(...mem);
  allPgResults.push(...pg);

  // stick them side by side
  const memoryTotals = aggregate(mem);
  const pgTotals = aggregate(pg);

  rawResults.push({
    pg: pgTotals,
    memory: memoryTotals,
  });
}

const rawTable = (results: AggregateResults[]) =>
  results.map(({ pg, memory }) => ({
    ...Object.entries(memory).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [`mem.${key}`]: value.toFixed(5),
      }),
      {},
    ),

    ...Object.entries(pg).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [`pg.${key}`]: value.toFixed(5),
      }),
      {},
    ),
  }));

const compareTable = (results: AggregateResults[]) =>
  results.map(({ pg, memory }) => {
    const keys = Object.keys(memory).map((key) => {
      const split = key.split(".");
      return split[split.length - 1];
    });

    return keys.reduce(
      (acc, key) => ({
        ...acc,
        [`${key} diff`]: (memory[key] - pg[key]).toFixed(5),
        [`${key} x`]: `${(memory[key] / pg[key]).toFixed(2)}x`,
      }),
      {},
    );
  });

console.table(rawTable(rawResults));

if (!isPgDisabled) {
  console.table(compareTable(rawResults));
}

pg?.destroy();
await memory.destroy();
