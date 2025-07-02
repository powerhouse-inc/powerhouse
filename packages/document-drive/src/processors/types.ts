import { type ListenerFilter } from "#drive-document-model/gen/schema/types";
import { type InternalTransmitterUpdate } from "#server/listener/transmitter/internal";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { type PHDocument } from "document-model";
import { type Kysely } from "kysely";

export type IOperationalStore<Schema = unknown> = Kysely<Schema>;

export interface IProcessorHostModule {
  analyticsStore: IAnalyticsStore;
  operationalStore: IOperationalStore;
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
  onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void>;

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
 * @param driveId The drive to create processors for.
 * @returns A list of processor records.
 */
export type ProcessorFactory = (driveId: string) => ProcessorRecord[];

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
