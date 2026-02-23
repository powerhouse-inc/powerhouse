import {
  DEFAULT_ANALYTICS_PROCESSOR_DB_NAME,
  type IProcessorHostModule,
} from "@powerhousedao/shared/processors";

export async function createProcessorHostModule(): Promise<
  IProcessorHostModule | undefined
> {
  try {
    const { getDb } = await import("../pglite.db.js");
    const { createOrGetAnalyticsStore } =
      await import("@powerhousedao/reactor-browser/analytics");
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
  } catch (error) {
    console.error(`Failed to initialize processor host module:`);
    console.error(error);
  }
}
