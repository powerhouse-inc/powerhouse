import { createAnalyticsStore } from "@powerhousedao/reactor-browser";
import { type IProcessorHostModule } from "@powerhousedao/shared/processors";
import { getDb } from "../pglite.db.js";

export async function createProcessorHostModule(): Promise<
  IProcessorHostModule | undefined
> {
  try {
    const { pgLite, relationalDb } = await getDb();
    const { store: analyticsStore } = await createAnalyticsStore({
      pgLite,
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
