import type { IProcessorHostModuleBase } from "@powerhousedao/shared/processors";
import type {
  IReactorClient,
  IReactorReadClient,
  IReactorWriteClient,
  WriteHandle,
} from "../client/types.js";
import type { IReadModel } from "../read-models/interfaces.js";
import type { ReactorReadModels } from "../read-models/names.js";
import { JobStatus, PropagationMode } from "../shared/types.js";

/**
 * Host module fields every reactor host provides: the shared core plus the
 * read half, the client facade and typed read-model lookup. Hosts extend it
 * with what only they can name (the attachment client) as
 * `IProcessorHostModule`.
 *
 * A processor reads through `read` and writes through `dispatch`, which needs
 * no write client.
 */
export interface IReactorProcessorHostModuleBase extends IProcessorHostModuleBase {
  /** The read half: documents, relationships and operations, gated. */
  read: IReactorReadClient;
  /**
   * The client facade.
   *
   * @deprecated Read through `read` and write through `dispatch`
   * (`execute`, `createInDrive`, `deleteDocument`).
   */
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
  /** The read half processors read through; defaults to `client.read`. */
  read?: IReactorReadClient;
  /** The write half `dispatch` writes through; defaults to `client.write`. */
  write?: IReactorWriteClient;
  /** Registered read models, typically `readModelCoordinator.readModels`. */
  readModels: ReadonlyArray<Pick<IReadModel, "name">>;
};

/** Builds the reactor-level host module; hosts spread it and add their own fields. */
export function createReactorHostModuleBase(
  options: ReactorHostModuleBaseOptions,
): IReactorProcessorHostModuleBase {
  const {
    client,
    readModels,
    read: readOption,
    write: writeOption,
    ...core
  } = options;
  const read = readOption ?? client.read;
  const writeHalf = (): IReactorWriteClient => writeOption ?? client.write;

  /** The handle's job as it stands now; a write that needed no job is done. */
  const statusOf = async (
    handle: WriteHandle,
    signal: AbortSignal | undefined,
  ): Promise<string> => {
    if (handle.jobId === "") {
      return JobStatus.READ_READY;
    }
    const job = await read.getJobStatus(handle.jobId, signal);
    return job.status;
  };

  return {
    ...core,
    read,
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
      async createInDrive(driveId, document, parentFolder, signal) {
        const handle = await writeHalf().drives.addFile(
          driveId,
          document,
          parentFolder,
          signal,
        );
        const status = await statusOf(handle, signal);
        return { id: handle.jobId, status, documentId: handle.documentId };
      },
      async deleteDocument(docId, propagate, signal) {
        const handle = await writeHalf().deleteDocument(
          docId,
          propagate === "cascade"
            ? PropagationMode.Cascade
            : PropagationMode.None,
          signal,
        );
        const status = await statusOf(handle, signal);
        return { id: handle.jobId, status };
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
