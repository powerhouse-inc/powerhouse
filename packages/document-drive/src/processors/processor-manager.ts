import {
  type IProcessorManager,
  type ProcessorFactory,
  type ProcessorRecord,
} from "document-drive/processors/types";
import { InternalTransmitter } from "document-drive/server/listener/transmitter/internal";
import {
  type IDocumentDriveServer,
  type IListenerManager,
  type Listener,
} from "document-drive/server/types";
import { generateId } from "document-model";
import { EventEmitter } from "events";
import { childLogger } from "../../index.js";
import { isRelationalDbProcessor } from "./relational-db-processor.js";

// Define the events that ProcessorManager can emit
export interface ProcessorManagerEvents {
  processorRegistered: { identifier: string };
  processorFailed: {
    identifier: string;
    error: string;
    stage: "factory" | "initAndUpgrade";
  };
}

// Create a typed EventEmitter for ProcessorManager
interface TypedProcessorManagerEventEmitter {
  on<K extends keyof ProcessorManagerEvents>(
    event: K,
    listener: (args: ProcessorManagerEvents[K]) => void,
  ): this;

  off<K extends keyof ProcessorManagerEvents>(
    event: K,
    listener: (args: ProcessorManagerEvents[K]) => void,
  ): this;

  emit<K extends keyof ProcessorManagerEvents>(
    event: K,
    args: ProcessorManagerEvents[K],
  ): boolean;

  once<K extends keyof ProcessorManagerEvents>(
    event: K,
    listener: (args: ProcessorManagerEvents[K]) => void,
  ): this;
}

export class ProcessorManager
  extends EventEmitter
  implements IProcessorManager, TypedProcessorManagerEventEmitter
{
  private readonly logger = childLogger([
    "document-drive",
    "processor-manager",
  ]);

  private processorsByDrive = new Map<string, ProcessorRecord[]>();
  private idToFactory = new Map<string, ProcessorFactory>();
  private identifierToListeners = new Map<string, Listener[]>();
  private processorSuccessCount = new Map<string, number>(); // identifier -> successful drive count
  private processorFailures = new Set<string>(); // identifiers that have failed

  constructor(
    private listenerManager: IListenerManager,
    private drive: IDocumentDriveServer,
  ) {
    super();
  }

  async registerFactory(
    identifier: string,
    factory: ProcessorFactory,
  ): Promise<void> {
    this.logger.debug(`Registering factory '${identifier}'.`);

    this.idToFactory.set(identifier, factory);

    // Reset tracking for this processor
    this.processorSuccessCount.set(identifier, 0);
    this.processorFailures.delete(identifier);

    // iterate over all drives and register the factory
    const driveIds = await this.drive.getDrives();
    if (!driveIds) {
      return;
    }
    const totalDrives = driveIds.length;

    for (const driveId of driveIds) {
      await this.createProcessors(driveId, identifier, factory, totalDrives);
    }
  }

  async unregisterFactory(identifier: string): Promise<void> {
    // remove all listeners for this identifier
    const listeners = this.identifierToListeners.get(identifier) ?? [];
    for (const listener of listeners) {
      await this.listenerManager
        .removeListener(listener.driveId, listener.listenerId)
        .catch(this.logger.error);

      if (listener.transmitter?.disconnect) {
        await listener.transmitter.disconnect();
      }
    }

    this.identifierToListeners.set(identifier, []);
    // Clean up tracking
    this.processorSuccessCount.delete(identifier);
    this.processorFailures.delete(identifier);
  }

  async registerDrive(driveId: string) {
    this.logger.debug(`Registering drive '${driveId}'.`);

    // Get total drives for tracking
    const driveIds = await this.drive.getDrives();
    const totalDrives = driveIds?.length ?? 0;

    // iterate over all factories and create listeners
    for (const [identifier, factory] of this.idToFactory) {
      await this.createProcessors(driveId, identifier, factory, totalDrives);
    }
  }

  /**
   * Creates processors for a specific (drive, identifier) pair.
   *
   * This should be called once and only once for each (drive, identifier),
   * unless unregisterFactory is called, which will remove them.
   */
  private async createProcessors(
    driveId: string,
    identifier: string,
    factory: ProcessorFactory,
    totalDrives: number,
  ) {
    let listeners = this.identifierToListeners.get(identifier);
    if (!listeners) {
      listeners = [];
      this.identifierToListeners.set(identifier, listeners);
    }

    let driveProcessors = this.processorsByDrive.get(driveId);
    if (!driveProcessors) {
      driveProcessors = [];
      this.processorsByDrive.set(driveId, driveProcessors);
    }

    // don't let the factory throw, we want to continue with the rest of the processors
    let processors: ProcessorRecord[] = [];
    try {
      processors = await factory(driveId);
    } catch (e) {
      this.logger.error(`Error creating processors for drive ${driveId}:`, e);
      this.markProcessorFailed(identifier, e, "factory");
      return;
    }

    for (const { filter, processor } of processors) {
      const isRelational = isRelationalDbProcessor(processor);

      // check for duplicated namespaces
      if (
        isRelational &&
        driveProcessors.some(
          (p) =>
            isRelationalDbProcessor(p.processor) &&
            p.processor.namespace === processor.namespace,
        )
      ) {
        this.logger.warn(
          `Processor with namespace '${processor.namespace}' already registered for drive '${driveId}'.`,
        );
        continue;
      }

      if (isRelational) {
        try {
          await processor.initAndUpgrade();
          this.markProcessorSuccess(identifier, totalDrives);
        } catch (e) {
          this.markProcessorFailed(identifier, e, "initAndUpgrade");
        }
      } else {
        this.markProcessorSuccess(identifier, totalDrives);
      }

      const id = generateId();
      const listener: Listener = {
        driveId,
        listenerId: id,
        block: false,
        system: false,
        filter,
        callInfo: undefined,
        transmitter: new InternalTransmitter(this.drive, processor),
      };

      await this.listenerManager.setListener(driveId, listener);

      listeners.push(listener);
      driveProcessors.push({ filter, processor });
    }
  }

  private markProcessorSuccess(identifier: string, totalDrives: number) {
    const currentCount = this.processorSuccessCount.get(identifier) || 0;
    const newCount = currentCount + 1;
    this.processorSuccessCount.set(identifier, newCount);

    // Only emit success when registered in ALL drives AND no failures occurred
    if (newCount >= totalDrives && !this.processorFailures.has(identifier)) {
      this.logger.debug(
        `Processor '${identifier}' successfully registered in all ${totalDrives} drives`,
      );
      this.emit("processorRegistered", { identifier });
    }
  }

  private markProcessorFailed(
    identifier: string,
    error: unknown,
    stage: "factory" | "initAndUpgrade",
  ) {
    // Only emit failure once per processor
    if (!this.processorFailures.has(identifier)) {
      this.processorFailures.add(identifier);
      this.emit("processorFailed", {
        identifier,
        error: error instanceof Error ? error.message : String(error),
        stage,
      });
    }
  }
}
