import { createOrGetAnalyticsStore } from "@powerhousedao/reactor-browser";
import {
  DEFAULT_ANALYTICS_PROCESSOR_DB_NAME,
  type IProcessorHostModule,
} from "shared/processors";
import { getDb } from "../pglite.db.js";

export async function createProcessorHostModule(): Promise<IProcessorHostModule> {
  const relationalDb = await getDb();
  const analyticsStore = await createOrGetAnalyticsStore({
    databaseName: DEFAULT_ANALYTICS_PROCESSOR_DB_NAME,
  });
  const processorApp = "connect" as const;
  return {
    relationalDb,
    analyticsStore,
    processorApp,
  };
}
