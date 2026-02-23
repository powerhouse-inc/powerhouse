import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { ProcessorApp } from "@powerhousedao/shared/processors";
import type {
  InternalTransmitterUpdate,
  ListenerFilter,
  RelationalDbProcessorLegacy,
} from "document-drive";
import type { PHDocumentHeader } from "document-model";
import type { Kysely, QueryCreator } from "kysely";
export type IRelationalQueryMethods =
  | "selectFrom"
  | "selectNoFrom"
  | "with"
  | "withRecursive";

export type IRelationalQueryBuilderLegacy<Schema = unknown> = Pick<
  QueryCreator<Schema>,
  IRelationalQueryMethods
> & {
  withSchema: (schema: string) => IRelationalQueryBuilderLegacy<Schema>;
};

export type IBaseRelationalDbLegacy<Schema = unknown> = Kysely<Schema>;

/**
 * The standardized relational database interface for relational db processors.
 * This abstraction provides type-safe database operations while hiding the underlying
 * database framework implementation details.
 **/
export type IRelationalDbLegacy<Schema = unknown> =
  IBaseRelationalDbLegacy<Schema> & {
    createNamespace<NamespaceSchema>(
      namespace: string,
    ): Promise<
      IRelationalDbLegacy<ExtractProcessorSchemaOrSelf<NamespaceSchema>>
    >;
    queryNamespace<NamespaceSchema>(
      namespace: string,
    ): IRelationalQueryBuilderLegacy<NamespaceSchema>;
  };

export interface IProcessorHostModuleLegacy {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDbLegacy;
  processorApp: ProcessorApp;
  config?: Map<string, unknown>;
}

/**
 * Describes an object that can process strands.
 */
export interface IProcessorLegacy {
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
export type ProcessorRecordLegacy = {
  processor: IProcessorLegacy;
  filter: ListenerFilter;
};

/**
 * A factory function that returns a list of processor records for a given drive.
 *
 * @param driveHeader The drive header to create processors for.
 * @returns A list of processor records.
 */
export type ProcessorFactoryLegacy = (
  driveHeader: PHDocumentHeader,
  processorApp?: ProcessorApp,
) => ProcessorRecordLegacy[] | Promise<ProcessorRecordLegacy[]>;

/**
 * Manages processor creation and destruction.
 */
export interface IProcessorManagerLegacy {
  /**
   * Registers a processor factory for a given identifier. This will create
   * processors for all drives that have already been registered.
   *
   * @param identifier Any identifier to associate with the factory.
   * @param factory The factory to register.
   */
  registerFactory(
    identifier: string,
    factory: ProcessorFactoryLegacy,
  ): Promise<void>;

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

export type RelationalDbProcessorFilterLegacy = ListenerFilter;
export interface IRelationalDbProcessorLegacy<
  TDatabaseSchema = unknown,
> extends IProcessorLegacy {
  namespace: string;
  query: IRelationalQueryBuilderLegacy<TDatabaseSchema>;
  filter: RelationalDbProcessorFilterLegacy;
  initAndUpgrade(): Promise<void>;
}

export type ExtractProcessorSchema<TProcessor> =
  TProcessor extends RelationalDbProcessorLegacy<infer TSchema>
    ? TSchema
    : never;

export type ExtractProcessorSchemaOrSelf<TProcessor> =
  TProcessor extends RelationalDbProcessorLegacy<infer TSchema>
    ? TSchema
    : TProcessor;

export type RelationalDbProcessorClassLegacy<TSchema> =
  typeof RelationalDbProcessorLegacy<TSchema>;

export type HashAlgorithmsLegacy = "fnv1a";
