import {
  IProcessorManager,
  ProcessorFactory,
} from "document-drive/processors/types";
import { InternalTransmitter } from "document-drive/server/listener/transmitter/internal";
import {
  IDocumentDriveServer,
  IListenerManager,
  Listener,
} from "document-drive/server/types";
import { generateId } from "document-model";

export class ProcessorManager implements IProcessorManager {
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
    // iterate over all factories and create listeners
    await Promise.all(
      Object.entries(this.idToFactory).map(([identifier, factory]) => {
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
      }),
    );
  }
}
