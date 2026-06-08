import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type { AttachmentBuildResult } from "@powerhousedao/reactor-attachments";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import type {
  IProcessorHostModule,
  IRelationalDb,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { IHttpAdapter } from "./graphql/gateway/types.js";
import type { IPackageManager } from "./packages/types.js";
import type { AuthService } from "./services/auth.service.js";
export type {
  IPackageLoader,
  IPackageLoaderOptions,
} from "./packages/types.js";

export interface IReactorProcessorHostModule extends IProcessorHostModule {
  client: IReactorClient;
  attachments: IAttachmentClient;
}

export type ReadinessGate = {
  isReady: () => boolean;
  markReady: () => void;
};

export type API = {
  httpAdapter: IHttpAdapter;
  graphqlManager: GraphQLManager;
  packages: IPackageManager;
  attachments: AttachmentBuildResult;
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
