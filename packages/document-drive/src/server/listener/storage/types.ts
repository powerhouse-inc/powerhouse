import { type Operation } from "document-model";
import { type Listener, type SynchronizationUnitId } from "../../types.js";

export type ListenerData = Omit<Listener, "transmitter">;

export interface IListenerStorage {
  init(): Promise<void>;

  getParents(): AsyncIterableIterator<string>;
  getListeners(parentId: string): AsyncIterableIterator<string>;
  getListener(
    parentId: string,
    listenerId: string,
  ): Promise<ListenerData | null>;

  hasListeners(parentId: string): Promise<boolean>;
  hasListener(parentId: string, listenerId: string): Promise<boolean>;

  addListener(
    parentId: string,
    listenerId: string,
    listenerState: ListenerData,
  ): Promise<void>;

  updateListener(
    parentId: string,
    listenerId: string,
    listenerState: ListenerData,
  ): Promise<void>;

  // updateListenerRevision(
  //   parentId: string,
  //   listenerId: string,
  //   syncUnitId: SynchronizationUnitId,
  //   listenerRev: number,
  //   lastUpdated: string,
  // ): Promise<void>;

  removeListeners(parentId: string): Promise<boolean>;
  removeListener(parentId: string, listenerId: string): Promise<boolean>;

  // checkOutdatedListeners(
  //   parentId: string,
  //   syncUnits: SynchronizationUnit[],
  // ): Promise<string[]>;

  // removeSyncUnits(
  //   parentId: string,
  //   syncUnits: SynchronizationUnitId[],
  // ): Promise<void>;
  // removeListenerSyncUnit(
  //   parentId: string,
  //   listenerId: string,
  //   syncUnitId: SynchronizationUnitId,
  // ): Promise<boolean>;
}

export type ListenerOperation = SynchronizationUnitId &
  Operation & {
    seq: number;
    documentId: string;
    documentType: string;
    scope: string;
    branch: string;
  };

export type ListenerOperationsIterator = AsyncGenerator<ListenerOperation[]>;
