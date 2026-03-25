import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import type {
  IProcessorHostModule,
  IRelationalDb,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { IHttpAdapter } from "./graphql/gateway/types.js";
import type { IPackageManager } from "./packages/types.js";
export type {
  IPackageLoader,
  IPackageLoaderOptions,
} from "./packages/types.js";

export type API = {
  app: IHttpAdapter;
  graphqlManager: GraphQLManager;
  packages: IPackageManager;
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
) => ProcessorDriveFactory;

/** Multiple initializers per package name (e.g. Switchboard `processors` option). */
export type Processor = ProcessorFactoryBuilder[];
