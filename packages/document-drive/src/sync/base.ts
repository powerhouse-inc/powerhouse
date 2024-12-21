import { DuplicatedTransmitterError, InitTransmittersError } from "./errors";
import { ListenerRegistry } from "./listener/registry";
import { ITransmitterManager, TransmitterManager } from "./transmitter";
import { ISyncManager } from "./types";
import { IListenerRegistry, Listener, ListenerInput } from "./listener/types";
import { ISyncUnitRegistry, SyncUnit, SyncUnitRegistry } from "./sync-unit";
import { OperationScope, Document } from "document-model/document";
import { buildSyncUnitId } from "./utils";
import { Subscribe } from "../utils/observable-map";

export interface ISyncManagerOptions {
  listenerRegistry?: IListenerRegistry;
}

export class SyncManager implements ISyncManager {
  private transmitterManager: ITransmitterManager = new TransmitterManager();
  private listenerRegistry: IListenerRegistry;
  private syncUnitRegistry: ISyncUnitRegistry = new SyncUnitRegistry();

  public onListener: Subscribe<string, Listener>;
  public onSyncUnit: Subscribe<string, SyncUnit>;

  constructor(options?: ISyncManagerOptions) {
    this.listenerRegistry = options?.listenerRegistry ?? new ListenerRegistry();
    this.onListener = this.listenerRegistry.on;
    this.onSyncUnit = this.syncUnitRegistry.on;
  }

  async init(): Promise<void> {
    await this.listenerRegistry.init();
  }

  // TODO lazy instantiate transmitters
  async #initTransmitters(): Promise<void> {
    const errors: Error[] = [];

    const listeners = await this.listenerRegistry.getAllListeners();

    // initialize transmitters for all listeners
    for (const listener of listeners) {
      try {
        this.transmitterManager.createTransmitter(listener);
      } catch (error) {
        // ignores error if it was due to the transmitter already being initialized
        if (error instanceof DuplicatedTransmitterError) {
          continue;
        }
        errors.push(error as Error);
      }
    }

    if (errors.length) {
      throw new InitTransmittersError(errors);
    }
  }

  async addDocumentSyncUnits(
    documentId: string,
    driveId: string | undefined,
    document: Document,
  ): Promise<SyncUnit[]> {
    const syncUnits: SyncUnit[] = [];
    for (const [scopeStr, operations] of Object.entries(document.operations)) {
      const scope = scopeStr as OperationScope;
      const lastOperation = operations.at(-1);
      const syncUnit = await this.syncUnitRegistry.addSyncUnit({
        id: buildSyncUnitId(documentId, scope),
        driveId: driveId ?? "",
        documentId,
        documentType: document.documentType,
        scope,
        branch: "main",
        lastUpdated: lastOperation?.timestamp ?? document.created,
        revision: lastOperation?.index ?? -1,
      });
      syncUnits.push(syncUnit);
    }
    return syncUnits;
  }

  async removeDocumentSyncUnits(documentId: string): Promise<SyncUnit[]> {
    const syncUnits = await this.syncUnitRegistry.filterSyncUnits({
      documentId: [documentId],
    });
    await Promise.all(
      syncUnits.map((syncUnit) =>
        this.syncUnitRegistry.removeSyncUnit(syncUnit.id),
      ),
    );
    return syncUnits;
  }

  async removeDriveSyncUnits(driveId: string): Promise<SyncUnit[]> {
    const syncUnits = await this.syncUnitRegistry.filterSyncUnits({
      driveId: [driveId],
    });
    await Promise.all(
      syncUnits.map((unit) => this.syncUnitRegistry.removeSyncUnit(unit.id)),
    );
    return syncUnits;
  }

  /**
   *
   * { @see IListenerRegistry } Listener manager methods
   *
   **/

  getListener(listenerId: string): Promise<Listener | undefined> {
    return this.listenerRegistry.getListener(listenerId);
  }

  getAllListeners(): Promise<Listener[]> {
    return this.listenerRegistry.getAllListeners();
  }

  async addListener(input: ListenerInput): Promise<Listener> {
    return await this.listenerRegistry.addListener(input);
  }

  async removeListener(listenerId: string): Promise<boolean> {
    const removed = await this.listenerRegistry.removeListener(listenerId);
    this.transmitterManager.deleteTransmitter(listenerId);
    return removed;
  }
}
