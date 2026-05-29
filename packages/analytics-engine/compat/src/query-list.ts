import * as fs from "fs";
import { parseArgs } from "util";
import { DateTime } from "luxon";
import type { AnalyticsGranularity } from "@powerhousedao/analytics-engine-core";

function loadQueries() {
  const raw = JSON.parse(fs.readFileSync("./data/query-list.json", "utf-8"));

  return raw.map(({ query }: { query: any }) => {
    const dimensions = [];
    for (const [key, value] of Object.entries(query.select)) {
      for (const { _v } of value as any[]) {
        dimensions.push({
          name: key,
          select: _v,
          lod: 2,
        });
      }
    }

    return {
      filter: {
        start: DateTime.fromISO(query.start),
        end: query.end ? DateTime.fromISO(query.end) : null,
        metrics: query.metrics,
        granularity: query.granularity as AnalyticsGranularity,
        currency: query.currency?._v,
        dimensions,
      },
    };
  });
}

function deepEquals(a: any, b: any) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      throw new Error(
        `Mismatch: ${JSON.stringify(a)} is array but ${JSON.stringify(b)} is not`,
      );
    }

    if (a.length !== b.length) {
      throw new Error(
        `Mismatch: ${JSON.stringify(a)} length ${a.length} !== ${JSON.stringify(b)} length ${b.length}`,
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

// --src [url] --target [url]
const options = {
  src: { type: "string", short: "s" },
  target: { type: "string", short: "t" },
} as const;

// pull in command line arguments
const args = parseArgs({ args: process.argv.slice(2), options });

if (!args.values.src) {
  throw new Error("Missing --src");
}

if (!args.values.target) {
  throw new Error("Missing --target");
}

// create stores
const srcUrl = args.values.src;
const targetUrl = args.values.target;

// load the queries
const queries = loadQueries();

const makeGqlRequest = async (host: string, variables: object) => {
  const headers = new Headers();
  headers.append("Content-Type", "application/json");

  const res = await fetch(host, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query:
        "\n    query Analytics($filter: AnalyticsFilter) {\n      analytics {\n        series(filter: $filter) {\n          period\n          start\n          end\n          rows {\n            dimensions {\n              name\n              path\n            }\n            metric\n            unit\n            value\n            sum\n          }\n        }\n      }\n    }\n  ",
      operationName: "Analytics",
      variables,
    }),
  });

  return await res.json();
};

const main = async () => {
  let i = 0;

  for (const query of queries) {
    console.log(`Comparing query (${i++})...`);

    const [srcRes, targetRes] = await Promise.all([
      makeGqlRequest(srcUrl, query),
      makeGqlRequest(targetUrl, query),
    ]);

    try {
      deepEquals(srcRes, targetRes);
    } catch (error) {
      console.log("Mismatch on query", JSON.stringify(query));

      throw error;
    }
  }
};

main();
