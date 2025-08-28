import type {
  IDocumentDriveServer,
  IListenerManager,
  IProcessorManager,
  ProcessorFactory,
  ProcessorRecord,
  ServerListener,
} from "document-drive";
import {
  childLogger,
  InternalTransmitter,
  isRelationalDbProcessor,
} from "document-drive";
import { generateId } from "document-model";

export class ProcessorManager implements IProcessorManager {
  private readonly logger = childLogger([
    "document-drive",
    "processor-manager",
  ]);

  private processorsByDrive = new Map<string, ProcessorRecord[]>();
  private idToFactory = new Map<string, ProcessorFactory>();
  private identifierToListeners = new Map<string, ServerListener[]>();

  constructor(
    private listeners: IListenerManager,
    private drive: IDocumentDriveServer,
  ) {
    //
  }

  async registerFactory(
    identifier: string,
    factory: ProcessorFactory,
  ): Promise<void> {
    this.logger.debug(`Registering factory '${identifier}'.`);

    this.idToFactory.set(identifier, factory);

    // iterate over all drives and register the factory
    const driveIds = await this.drive.getDrives();
    for (const driveId of driveIds) {
      await this.createProcessors(driveId, identifier, factory);
    }
  }

  async unregisterFactory(identifier: string): Promise<void> {
    // remove all listeners for this identifier
    const listeners = this.identifierToListeners.get(identifier) ?? [];
    for (const listener of listeners) {
      await this.listeners
        .removeListener(listener.driveId, listener.listenerId)
        .catch(this.logger.error);

      if (listener.transmitter?.disconnect) {
        await listener.transmitter.disconnect();
      }
    }

    this.identifierToListeners.set(identifier, []);
  }

  async registerDrive(driveId: string) {
    this.logger.debug(`Registering drive '${driveId}'.`);

    // iterate over all factories and create listeners
    for (const [identifier, factory] of this.idToFactory) {
      await this.createProcessors(driveId, identifier, factory);
    }
  }

  /**
   * Creates processors for a specific (drive, identifier) pair.
   *
   * This should be called once and only once for each (drive, identifier),
   * unless unregisterFactory is called, which will remove them.
   */
  async createProcessors(
    driveId: string,
    identifier: string,
    factory: ProcessorFactory,
  ) {
    const drive = await this.drive.getDrive(driveId);

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
      processors = await factory(drive.header);
    } catch (e) {
      this.logger.error(`Error creating processors for drive ${driveId}:`, e);
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
        await processor.initAndUpgrade();
      }

      const id = generateId();
      const listener: ServerListener = {
        driveId,
        listenerId: id,
        block: false,
        system: false,
        filter,
        callInfo: undefined,
        transmitter: new InternalTransmitter(this.drive, processor),
      };

      await this.listeners.setListener(driveId, listener);

      listeners.push(listener);
      driveProcessors.push({ filter, processor });
    }
  }
}
