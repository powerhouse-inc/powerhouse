import type { ReactorContext } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import type { OperationWithContext } from "../storage/interfaces.js";

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
};

/**
 * A factory function that creates processor records for a given drive.
 * Called once per drive when the drive is first detected or when the factory is registered.
 */
export type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
  context?: ReactorContext,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;

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
   * Gets all registered factory identifiers.
   */
  getFactoryIdentifiers(): string[];

  /**
   * Gets all processor records for a specific drive.
   */
  getProcessorsForDrive(driveId: string): ProcessorRecord[];
}
