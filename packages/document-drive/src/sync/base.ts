import { DuplicatedTransmitterError, InitTransmittersError } from "./errors";
import { ListenerRegistry } from "./listener/registry";
import { ITransmitterManager, TransmitterManager } from "./transmitter";
import { ISyncManager } from "./types";
import {
  IListenerRegistry,
  Listener,
  ListenerCallInfo,
  ListenerInput,
} from "./listener/types";
import { Subscribe } from "../utils/event-emitter";
import { ISyncUnitRegistry, SyncUnit, SyncUnitRegistry } from "./sync-unit";
import {
  DocumentDriveDocument,
  isFileNode,
} from "document-model-libs/document-drive";
import { OperationScope } from "document-model/document";
import { buildListenerFilter } from "./utils";

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
    await this.#initTransmitters();
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

  async addDrive(drive: DocumentDriveDocument): Promise<void> {
    const {
      created,
      state: {
        global: { id, nodes },
      },
      operations: { global },
    } = drive;

    // creates drive sync unit
    await this.addSyncUnit({
      id, // drive id is used as sync unit id
      driveId: id,
      documentId: "",
      scope: "global",
      branch: "main",
      documentType: "powerhouse/document-drive",
      lastUpdated: created,
      revision: global.at(-1)?.index ?? -1,
    });

    // creates sync units for all documents in the drive
    for (const node of nodes) {
      if (!isFileNode(node)) {
        continue;
      }
      for (const syncUnit of node.synchronizationUnits) {
        await this.addSyncUnit({
          id: syncUnit.syncId,
          driveId: id,
          documentId: node.id,
          documentType: node.documentType,
          scope: syncUnit.scope as OperationScope,
          branch: syncUnit.branch,
          revision: -1,
          lastUpdated: created,
        });
      }
    }
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
    const listener = await this.listenerRegistry.addListener(input);

    try {
      // Create the transmitter for the added listener
      this.transmitterManager.createTransmitter(listener);
    } catch (error) {
      if (!(error instanceof DuplicatedTransmitterError)) {
        // if initialization failed then reverts adding the listener
        throw error;
      }
    }

    return listener;
  }

  async removeListener(listenerId: string): Promise<boolean> {
    const removed = await this.listenerRegistry.removeListener(listenerId);
    this.transmitterManager.deleteTransmitter(listenerId);
    return removed;
  }

  /**
   *
   * { @see ISyncUnitRegistry } Listener manager methods
   *
   **/
  addSyncUnit(syncUnit: SyncUnit): Promise<SyncUnit> {
    return this.syncUnitRegistry.addSyncUnit(syncUnit);
  }

  removeSyncUnit(syncUnitId: string): Promise<boolean> {
    return this.syncUnitRegistry.removeSyncUnit(syncUnitId);
  }

  getSyncUnit(syncUnitId: string): Promise<SyncUnit | undefined> {
    return this.syncUnitRegistry.getSyncUnit(syncUnitId);
  }

  getAllSyncUnits(): Promise<SyncUnit[]> {
    return this.syncUnitRegistry.getAllSyncUnits();
  }
}
