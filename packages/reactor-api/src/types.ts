import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient, ReactorReadModels } from "@powerhousedao/reactor";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type {
  AttachmentBuildResult,
  AttachmentReferenceIndexBuildResult,
} from "@powerhousedao/reactor-attachments";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import type {
  IProcessorHostModuleBase,
  IRelationalDb,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { IHttpAdapter } from "./graphql/gateway/types.js";
import type { IPackageManager } from "./packages/types.js";
import type { IAttachmentAccessService } from "./services/attachment-access.service.js";
import type { AuthService } from "./services/auth.service.js";
export type {
  IPackageLoader,
  IPackageLoaderOptions,
} from "./packages/types.js";

/**
 * Module hosts pass to processor factories. Declared here (not in shared)
 * because shared cannot depend on reactor or reactor-attachments.
 * Keep in sync with `IProcessorHostModule` in @powerhousedao/reactor-browser.
 */
export interface IProcessorHostModule extends IProcessorHostModuleBase {
  client: IReactorClient;
  attachments: IAttachmentClient;
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

/** @deprecated Use `IProcessorHostModule`. */
export type IReactorProcessorHostModule = IProcessorHostModule;

export type ReadinessGate = {
  isReady: () => boolean;
  markReady: () => void;
};

export type API = {
  httpAdapter: IHttpAdapter;
  graphqlManager: GraphQLManager;
  packages: IPackageManager;
  attachments: AttachmentBuildResult;
  attachmentReferenceIndex: AttachmentReferenceIndexBuildResult;
  /** Document-authorized attachment read decisions; see AttachmentAccessService. */
  attachmentAccess: IAttachmentAccessService;
  authService: AuthService | undefined;
  /**
   * Releases resources owned by the API: shuts down the GraphQL gateway,
   * closes WebSocket and HTTP servers, destroys knex pools, and closes any
   * PGlite instances created via {@link getDbClient}. Safe to call once;
   * intended to be wired into the reactor's shutdown chain via
   * `ReactorBuilder.withShutdownHook`.
   */
  dispose: () => Promise<void>;
};

export type ReactorModule = {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
};

/** Per-drive factory after the host `module` has been applied once. */
export type ProcessorDriveFactory = (
  driveHeader: PHDocumentHeader,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;

/**
 * Builds a per-drive factory from the host module (e.g. vetra `processorFactory`).
 * Shape: `(module) => (driveHeader) => ...`
 */
export type ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => ProcessorDriveFactory | Promise<ProcessorDriveFactory>;

/** Multiple initializers per package name (e.g. Switchboard `processors` option). */
export type Processor = ProcessorFactoryBuilder[];
