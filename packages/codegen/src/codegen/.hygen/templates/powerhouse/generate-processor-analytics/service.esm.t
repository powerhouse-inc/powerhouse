---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/src/service.ts"
force: true
---
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { PostgresAnalyticsStore } from "@powerhousedao/analytics-engine-pg";

let store: IAnalyticsStore | null = null;

export default function get(): IAnalyticsStore {
  if (!store) {
    const connectionString = process.env.PG_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("PG_CONNECTION_STRING not set");
    }

    store = new PostgresAnalyticsStore(connectionString, (i, q) =>
      console.log(`[PG] ${i}: ${q}`)
    );
  }

  return store;
}
