import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { IAnalyticsStore } from "../analytics/types.js";
import type { PHDocumentHeader } from "../document-model/documents.js";
import type { PROCESSOR_APPS } from "./constants.js";
import type { IRelationalDb } from "./relational/types.js";

export interface IProcessorHostModule {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
  processorApp: ProcessorApp;
  config?: Map<string, unknown>;
  /** Reactor client for dispatching actions back to documents */
  reactorClient?: unknown;
}

/**
 * Filter for matching operations to processors.
 * All fields are optional arrays - when provided, operations must match at least one value in each specified field.
 * When a field is undefined or empty, it matches all values for that field.
 */
export type ProcessorFilter = {
  documentType?: string[];
  scope?: string[];
  branch?: string[];
  documentId?: string[];
};

/**
 * Describes an object that can process operations.
 */
export interface IProcessor {
  /**
   * Processes a list of operations with context.
   * Called when operations match this processor's filter.
   */
  onOperations(operations: OperationWithContext[]): Promise<void>;

  /**
   * Called when the processor is disconnected.
   * Used to clean up any resources allocated during processor creation.
   */
  onDisconnect(): Promise<void>;
}

/**
 * Relates a processor to its filter configuration.
 */
export type ProcessorRecord = {
  processor: IProcessor;
  filter: ProcessorFilter;
  startFrom?: "beginning" | "current";
};

/**
 * A factory function that creates processor records for a given drive.
 * Called once per drive when the drive is first detected or when the factory is registered.
 */
export type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
  processorApp?: ProcessorApp,
) => Promise<ProcessorRecord[]> | ProcessorRecord[];

/** Takes a processor host module and builds processor factories using its context */
export type ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => Promise<ProcessorFactory> | ProcessorFactory;

export type ProcessorStatus = "active" | "errored";

export type TrackedProcessor = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  record: ProcessorRecord;
  lastOrdinal: number;
  status: ProcessorStatus;
  lastError: string | undefined;
  lastErrorTimestamp: Date | undefined;
  retry: () => Promise<void>;
};

/**
 * Manages processor creation and destruction based on drive operations.
 */
export interface IProcessorManager {
  /**
   * Registers a processor factory.
   * Immediately creates processors for all existing drives.
   */
  registerFactory(identifier: string, factory: ProcessorFactory): Promise<void>;

  /**
   * Unregisters a processor factory and disconnects all processors it created.
   */
  unregisterFactory(identifier: string): Promise<void>;

  /**
   * Gets a tracked processor by its ID.
   */
  get(processorId: string): TrackedProcessor | undefined;

  /**
   * Gets all tracked processors.
   */
  getAll(): TrackedProcessor[];
}

export type ProcessorApp = (typeof PROCESSOR_APPS)[number];

export type ProcessorApps = readonly ProcessorApp[];
