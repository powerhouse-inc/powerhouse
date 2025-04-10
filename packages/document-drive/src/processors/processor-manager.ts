import {
  type IProcessorManager,
  type ProcessorFactory,
} from "document-drive/processors/types";
import { InternalTransmitter } from "document-drive/server/listener/transmitter/internal";
import {
  type IDocumentDriveServer,
  type IListenerManager,
  type Listener,
} from "document-drive/server/types";
import { generateId } from "document-model";
import { childLogger } from "../../index.js";

export class ProcessorManager implements IProcessorManager {
  private readonly logger = childLogger([
    "document-drive",
    "processor-manager",
  ]);

  private idToFactory = new Map<string, ProcessorFactory>();
  private identifierToListeners = new Map<string, Listener[]>();

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
    this.logger.info(`Registering factory '${identifier}'.`);

    this.idToFactory.set(identifier, factory);

    // iterate over all drives and register the factory
    const driveIds = await this.drive.getDrives();
    for (const driveId of driveIds) {
      await this.registerDrive(driveId);
    }
  }

  async unregisterFactory(identifier: string): Promise<void> {
    // remove all listeners for this identifier
    const listeners = this.identifierToListeners.get(identifier) ?? [];
    for (const listener of listeners) {
      this.listeners.removeListener(listener.driveId, listener.listenerId);

      if (listener.transmitter?.disconnect) {
        await listener.transmitter.disconnect();
      }
    }

    this.identifierToListeners.set(identifier, []);
  }

  async registerDrive(driveId: string) {
    this.logger.info(`Registering drive '${driveId}'.`);

    // iterate over all factories and create listeners
    for (const [identifier, factory] of this.idToFactory) {
      let listeners = this.identifierToListeners.get(identifier) ?? [];
      if (!listeners) {
        listeners = [];
        this.identifierToListeners.set(identifier, listeners);
      }

      const processors = factory(driveId);

      for (const { filter, processor } of processors) {
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

        this.listeners.setListener(driveId, listener);

        listeners.push(listener);
      }
    }
  }
}
