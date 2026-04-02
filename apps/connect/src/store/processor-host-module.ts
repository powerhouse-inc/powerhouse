import { createAnalyticsStore } from "@powerhousedao/reactor-browser";
import type { Action } from "@powerhousedao/shared/document-model";
import { type IProcessorHostModule } from "@powerhousedao/shared/processors";
import { getDb } from "../pglite.db.js";

export interface IReactorDispatch {
  executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<{ id: string; status: string }>;
}

interface INamedReadModel {
  readonly name: string;
}

export async function createProcessorHostModule(
  reactorClient: IReactorDispatch,
  readModels: INamedReadModel[],
): Promise<IProcessorHostModule | undefined> {
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
      dispatch: {
        async execute(docId, branch, actions, signal) {
          const jobInfo = await reactorClient.executeAsync(
            docId,
            branch,
            actions,
            signal,
          );
          return { id: jobInfo.id, status: jobInfo.status };
        },
      },
      getReadModel<T>(name: string): T {
        const model = readModels.find((m) => m.name === name);
        if (!model) {
          throw new Error(`Read model "${name}" not found`);
        }
        return model as unknown as T;
      },
    };
  } catch (error) {
    console.error(`Failed to initialize processor host module:`);
    console.error(error);
  }
}
