import fs from "fs";
import crc32 from "crc-32";
import {
  AnalyticsGranularity,
  type AnalyticsQuery,
} from "@powerhousedao/analytics-engine-core";

type QueryRecord = {
  crc: number;
  query: AnalyticsQuery;
  hitCount: number;
  modules: string[];
  names: string[];
};

// load query-cache.json
const queries = JSON.parse(fs.readFileSync("./data/query-cache.json", "utf-8"));

// aggregate
const querySet: { [crc: number]: QueryRecord } = {};
for (const { analyticsQuery, hitCount, moduleName, queryName } of queries) {
  let json = null;
  try {
    json = JSON.parse(analyticsQuery);
  } catch {
    continue;
  }

  const crc = crc32.str(analyticsQuery);
  if (!querySet[crc]) {
    querySet[crc] = {
      crc,
      query: {
        start: json.start,
        end: json.end,
        currency: json.currency ?? undefined,
        metrics: json.metrics,
        select: json.select,
        granularity: json.granularity as AnalyticsGranularity,
        lod: {},
      },
      hitCount: 0,
      modules: [],
      names: [],
    };
  }

  const set = querySet[crc];
  set.hitCount += hitCount;

  if (!set.modules.includes(moduleName)) {
    set.modules.push(moduleName);
  }

  if (!set.names.includes(queryName)) {
    set.names.push(queryName);
  }
}

const queryList: QueryRecord[] = [];
for (const crc in querySet) {
  const set = querySet[crc];

  queryList.push(set);
}

// write query-list.json
fs.writeFileSync("./data/query-list.json", JSON.stringify(queryList, null, 2));

console.log(`Wrote ${queryList.length} queries to query-list.json.`);
