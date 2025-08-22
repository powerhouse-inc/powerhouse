import { type ListenerFilter } from "#drive-document-model/gen/schema/types";
import { type InternalTransmitterUpdate } from "#server/listener/transmitter/internal";
import { type PHDocumentHeader } from "document-model";
import { type Kysely, type QueryCreator } from "kysely";
import { type ExtractProcessorSchemaOrSelf } from "./relational.js";

// TODO: Add @powerhousedao/analytics-engine-core dependency when needed
type IAnalyticsStore = any;

export type IRelationalQueryMethods =
  | "selectFrom"
  | "selectNoFrom"
  | "with"
  | "withRecursive";

export type IRelationalQueryBuilder<Schema = unknown> = Pick<
  QueryCreator<Schema>,
  IRelationalQueryMethods
> & {
  withSchema: (schema: string) => IRelationalQueryBuilder<Schema>;
};

export type IBaseRelationalDb<Schema = unknown> = Kysely<Schema>;

/**
 * The standardized relational database interface for relational db processors.
 * This abstraction provides type-safe database operations while hiding the underlying
 * database framework implementation details.
 **/
export type IRelationalDb<Schema = unknown> = IBaseRelationalDb<Schema> & {
  createNamespace<NamespaceSchema>(
    namespace: string,
  ): Promise<IRelationalDb<ExtractProcessorSchemaOrSelf<NamespaceSchema>>>;
  queryNamespace<NamespaceSchema>(
    namespace: string,
  ): IRelationalQueryBuilder<NamespaceSchema>;
};

export interface IProcessorHostModule {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
}

/**
 * Describes an object that can process strands.
 */
export interface IProcessor {
  /**
   * Processes a list of strands.
   *
   * @param strands The strands to process.
   */
  onStrands(strands: InternalTransmitterUpdate[]): Promise<void>;

  /**
   * Called when the processor is disconnected. This is generally meant to
   * clean up any resources that were allocated when the processor was created.
   */
  onDisconnect(): Promise<void>;
}

/**
 * Relates a processor to a listener filter.
 */
export type ProcessorRecord = {
  processor: IProcessor;
  filter: ListenerFilter;
};

/**
 * A factory function that returns a list of processor records for a given drive.
 *
 * @param driveHeader The drive header to create processors for.
 * @returns A list of processor records.
 */
export type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;

/**
 * Manages processor creation and destruction.
 */
export interface IProcessorManager {
  /**
   * Registers a processor factory for a given identifier. This will create
   * processors for all drives that have already been registered.
   *
   * @param identifier Any identifier to associate with the factory.
   * @param factory The factory to register.
   */
  registerFactory(identifier: string, factory: ProcessorFactory): Promise<void>;

  /**
   * Unregisters a processor factory for a given identifier. This will remove
   * all listeners that were created by the factory.
   *
   * @param identifier The identifier to unregister.
   */
  unregisterFactory(identifier: string): Promise<void>;

  /**
   * Registers a drive with the processor manager. This will create processors
   * for the drive for all factories that have already been registered.
   *
   * @param driveId The drive to register.
   */
  registerDrive(driveId: string): Promise<void>;
}
