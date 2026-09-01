import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorProcessorHostModuleBase,
  ProcessorFactoryBuilder as BaseProcessorFactoryBuilder,
} from "@powerhousedao/reactor";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type {
  AttachmentBuildResult,
  AttachmentReferenceIndexBuildResult,
} from "@powerhousedao/reactor-attachments";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type {
  IRelationalDb,
  ProcessorFactory,
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
 * Module hosts pass to processor factories: the reactor-level module plus the
 * attachment client, which shared and reactor cannot name.
 */
export interface IProcessorHostModule extends IReactorProcessorHostModuleBase {
  attachments: IAttachmentClient;
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

/** @deprecated Use `ProcessorFactory`. */
export type ProcessorDriveFactory = ProcessorFactory;

/** Builds a per-drive factory from the host module (e.g. vetra `processorFactory`). */
export type ProcessorFactoryBuilder =
  BaseProcessorFactoryBuilder<IProcessorHostModule>;

/** Multiple initializers per package name (e.g. Switchboard `processors` option). */
export type Processor = ProcessorFactoryBuilder[];
