import type { IProcessorHostModuleBase } from "@powerhousedao/shared/processors";
import type { IReactorClient } from "../client/types.js";
import type { IReadModel } from "../read-models/interfaces.js";
import type { ReactorReadModels } from "../read-models/names.js";

/**
 * Host module fields every reactor host provides: the shared core plus the
 * reactor client and typed read-model lookup. Hosts extend it with what only
 * they can name (the attachment client) as `IProcessorHostModule`.
 */
export interface IReactorProcessorHostModuleBase extends IProcessorHostModuleBase {
  client: IReactorClient;
  /**
   * Retrieves a registered read model by name.
   *
   * Reactor-registered names are typed via `ReactorReadModels` — hover a key
   * there for what each model holds:
   * - `"document-view"` (materialized document state, `IDocumentView`)
   * - `"document-indexer"` (document relationship graph, `IDocumentIndexer`).
   *
   * Other names return the caller-supplied type.
   * Throws if no read model with that name is registered.
   */
  getReadModel<K extends keyof ReactorReadModels>(
    name: K,
  ): ReactorReadModels[K];
  getReadModel<T>(name: string): T;
}

export type ReactorHostModuleBaseOptions = Pick<
  IProcessorHostModuleBase,
  "analyticsStore" | "relationalDb" | "processorApp" | "config"
> & {
  client: IReactorClient;
  /** Registered read models, typically `readModelCoordinator.readModels`. */
  readModels: ReadonlyArray<Pick<IReadModel, "name">>;
};

/** Builds the reactor-level host module; hosts spread it and add their own fields. */
export function createReactorHostModuleBase(
  options: ReactorHostModuleBaseOptions,
): IReactorProcessorHostModuleBase {
  const { client, readModels, ...core } = options;
  return {
    ...core,
    client,
    dispatch: {
      async execute(docId, branch, actions, signal) {
        const jobInfo = await client.executeAsync(
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
}
