import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { InternalTransmitter } from "document-drive/server/listener/transmitter/internal";
import {
  IDocumentDriveServer,
  IListenerManager,
  Listener,
} from "document-drive/server/types";
import { generateId } from "document-model";
import { Db, ProcessorFactory } from "../index.js";

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

export class ProcessorManager implements IProcessorManager {
  private idToFactory = new Map<string, ProcessorFactory>();
  private identifierToListeners = new Map<string, Listener[]>();

  constructor(
    private listeners: IListenerManager,
    private drive: IDocumentDriveServer,
    private operationalStore: Db,
    private analyticsStore: IAnalyticsStore,
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
    const module = {
      operationalStore: this.operationalStore,
      analyticsStore: this.analyticsStore,
    };

    // iterate over all factories and create listeners
    await Promise.all(
      Object.entries(this.idToFactory).map(([identifier, factory]) => {
        let listeners = this.identifierToListeners.get(identifier) ?? [];
        if (!listeners) {
          listeners = [];
          this.identifierToListeners.set(identifier, listeners);
        }

        const processors = factory(driveId, module);

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
