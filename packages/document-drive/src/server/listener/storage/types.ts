import { type Operation } from "document-model";
import { type Listener, type SynchronizationUnitId } from "../../types.js";

export type ListenerData = Omit<Listener, "transmitter">;

export interface IListenerStorage {
  init(): Promise<void>;

  /**
   * Async generator for parent IDs, yielding one parent ID at a time (flattened).
   * @param params Optional: { pageSize?: number, cursor?: string }
   *   - pageSize: controls internal batching only; does not affect yield type (always yields one at a time)
   *   - cursor: start after this parent_id (exclusive)
   * @yields string - a single parent ID per iteration.
   */
  getParents(params?: {
    pageSize?: number;
    cursor?: string;
  }): AsyncIterableIterator<string>;

  /**
   * Async generator for parent IDs, yielding each page (array) of results (advanced batching API).
   * @param params Optional: { pageSize?: number, cursor?: string }
   *   - pageSize: number of items per page (default 100)
   *   - cursor: start after this parent_id (exclusive)
   * @yields string[] - an array (page) of parent IDs.
   */
  getParentsPages(params?: {
    pageSize?: number;
    cursor?: string;
  }): AsyncIterableIterator<string[]>;

  /**
   * Async generator for listener IDs for a given parent, yielding one listener ID at a time (flattened).
   * @param parentId The parent ID
   * @param params Optional: { pageSize?: number, cursor?: string }
   *   - pageSize: controls internal batching only; does not affect yield type (always yields one at a time)
   *   - cursor: start after this listener_id (exclusive)
   * @yields string - a single listener ID per iteration.
   */
  getListeners(
    parentId: string,
    params?: { pageSize?: number; cursor?: string },
  ): AsyncIterableIterator<string>;

  /**
   * Async generator for listener IDs for a given parent, yielding each page (array) of results (advanced batching API).
   * @param parentId The parent ID
   * @param params Optional: { pageSize?: number, cursor?: string }
   *   - pageSize: number of items per page (default 100)
   *   - cursor: start after this listener_id (exclusive)
   * @yields string[] - an array (page) of listener IDs.
   */
  getListenersPages(
    parentId: string,
    params?: { pageSize?: number; cursor?: string },
  ): AsyncIterableIterator<string[]>;
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
