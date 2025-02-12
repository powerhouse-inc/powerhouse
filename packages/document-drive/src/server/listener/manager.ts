import { ListenerFilter } from "document-model-libs/document-drive";
import { OperationScope } from "document-model/document";
import { logger } from "../../utils/logger";
import { OperationError } from "../error";
import { ISynchronizationManager } from "../index";
import {
  DefaultListenerManagerOptions,
  DriveUpdateErrorHandler,
  ErrorStatus,
  GetStrandsOptions,
  IListenerManager,
  Listener,
  ListenerManagerOptions,
  ListenerState,
  ListenerUpdate,
  OperationUpdate,
  StrandUpdate,
  SynchronizationUnit,
  SynchronizationUnitQuery,
} from "../types";
import { StrandUpdateSource } from "./transmitter/types";

function debounce<T extends unknown[], R>(
  func: (...args: T) => Promise<R>,
  delay = 250,
) {
  let timer: number;
  return (immediate: boolean, ...args: T) => {
    if (timer) {
      clearTimeout(timer);
    }
    return new Promise<R>((resolve, reject) => {
      if (immediate) {
        func(...args)
          .then(resolve)
          .catch(reject);
      } else {
        timer = setTimeout(() => {
          func(...args)
            .then(resolve)
            .catch(reject);
        }, delay) as unknown as number;
      }
    });
  };
}

export class ListenerManager implements IListenerManager {
  static LISTENER_UPDATE_DELAY = 250;

  protected syncManager: ISynchronizationManager;

  // driveId -> listenerId -> listenerState
  protected listenerStateByDriveId = new Map<
    string,
    Map<string, ListenerState>
  >();
  protected options: ListenerManagerOptions;

  constructor(
    syncManager: ISynchronizationManager,
    options: ListenerManagerOptions = DefaultListenerManagerOptions,
  ) {
    this.syncManager = syncManager;
    this.options = { ...DefaultListenerManagerOptions, ...options };
  }

  async initialize(handler: DriveUpdateErrorHandler) {
    // if network connect comes back online
    // then triggers the listeners update
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.triggerUpdate(false, { type: "local" }, handler).catch((error) => {
          logger.error("Non handled error updating listeners", error);
        });
      });
    }
  }

  driveHasListeners(driveId: string) {
    return this.listenerStateByDriveId.has(driveId);
  }

  async setListener(driveId: string, listener: Listener) {
    // slight code smell -- drive id may not need to be on listener or not passed in
    if (driveId !== listener.driveId) {
      throw new Error("Drive ID mismatch");
    }

    let existingState;
    try {
      existingState = this.getListenerState(driveId, listener.listenerId);
    } catch {
      existingState = {};
    }

    // keep existing state if it exists
    this.setListenerState(driveId, listener.listenerId, {
      ...existingState,
      block: listener.block,
      driveId: listener.driveId,
      pendingTimeout: "0",
      listener,
      listenerStatus: "CREATED",
      syncUnits: new Map(),
    });

    this.triggerUpdate(true, { type: "local" });
  }

  async removeListener(driveId: string, listenerId: string) {
    const driveMap = this.listenerStateByDriveId.get(driveId);
    if (!driveMap) {
      return false;
    }

    return Promise.resolve(driveMap.delete(listenerId));
  }

  async removeSyncUnits(
    driveId: string,
    syncUnits: Pick<SynchronizationUnit, "syncId">[],
  ): Promise<void> {
    const listeners = this.listenerStateByDriveId.get(driveId);
    if (!listeners) {
      return;
    }
    for (const [, listener] of listeners) {
      for (const syncUnit of syncUnits) {
        listener.syncUnits.delete(syncUnit.syncId);
      }
    }
    return Promise.resolve();
  }

  async updateSynchronizationRevisions(
    driveId: string,
    syncUnits: SynchronizationUnit[],
    source: StrandUpdateSource,
    willUpdate?: (listeners: Listener[]) => void,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
    forceSync = false,
  ) {
    const listenerIdToListenerState = this.listenerStateByDriveId.get(driveId);
    if (!listenerIdToListenerState) {
      return [];
    }

    const outdatedListeners: Listener[] = [];
    for (const [, listenerState] of listenerIdToListenerState) {
      if (
        outdatedListeners.find(
          (l) => l.listenerId === listenerState.listener.listenerId,
        )
      ) {
        continue;
      }

      const transmitter = listenerState.listener.transmitter;
      if (!transmitter?.transmit) {
        continue;
      }

      for (const syncUnit of syncUnits) {
        if (!this._checkFilter(listenerState.listener.filter, syncUnit)) {
          continue;
        }

        const listenerRev = listenerState.syncUnits.get(syncUnit.syncId);

        if (!listenerRev || listenerRev.listenerRev < syncUnit.revision) {
          outdatedListeners.push(listenerState.listener);
          break;
        }
      }
    }

    if (outdatedListeners.length) {
      willUpdate?.(outdatedListeners);
      return this.triggerUpdate(forceSync, source, onError);
    }
    return [];
  }

  async updateListenerRevision(
    listenerId: string,
    driveId: string,
    syncId: string,
    listenerRev: number,
  ): Promise<void> {
    const drive = this.listenerStateByDriveId.get(driveId);
    if (!drive) {
      return;
    }

    const listener = drive.get(listenerId);
    if (!listener) {
      return;
    }

    const lastUpdated = new Date().toISOString();
    const entry = listener.syncUnits.get(syncId);
    if (entry) {
      entry.listenerRev = listenerRev;
      entry.lastUpdated = lastUpdated;
    } else {
      listener.syncUnits.set(syncId, { listenerRev, lastUpdated });
    }

    return Promise.resolve();
  }

  triggerUpdate = debounce(
    this._triggerUpdate.bind(this),
    ListenerManager.LISTENER_UPDATE_DELAY,
  );

  private async _triggerUpdate(
    source: StrandUpdateSource,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
  ) {
    const listenerUpdates: ListenerUpdate[] = [];
    for (const [driveId, drive] of this.listenerStateByDriveId) {
      for (const [_, listenerState] of drive) {
        const transmitter = listenerState.listener.transmitter;
        if (!transmitter?.transmit) {
          continue;
        }

        const syncUnits = await this.getListenerSyncUnits(
          driveId,
          listenerState.listener.listenerId,
        );

        const strandUpdates: StrandUpdate[] = [];
        // TODO change to push one after the other, reusing operation data
        const tasks = syncUnits.map((syncUnit) => async () => {
          const unitState = listenerState.syncUnits.get(syncUnit.syncId);

          if (unitState && unitState.listenerRev >= syncUnit.revision) {
            return;
          }

          const opData: OperationUpdate[] = [];
          try {
            const data = await this.syncManager.getOperationData(
              // TODO - join queries, DEAL WITH INVALID SYNC ID ERROR
              driveId,
              syncUnit.syncId,
              {
                fromRevision: unitState?.listenerRev,
              },
            );
            opData.push(...data);
          } catch (e) {
            logger.error(e);
          }

          if (!opData.length) {
            return;
          }

          strandUpdates.push({
            driveId,
            documentId: syncUnit.documentId,
            branch: syncUnit.branch,
            operations: opData,
            scope: syncUnit.scope as OperationScope,
          });
        });
        if (this.options.sequentialUpdates) {
          for (const task of tasks) {
            await task();
          }
        } else {
          await Promise.all(tasks.map((task) => task()));
        }

        if (strandUpdates.length == 0) {
          continue;
        }

        listenerState.pendingTimeout = new Date(
          new Date().getTime() / 1000 + 300,
        ).toISOString();
        listenerState.listenerStatus = "PENDING";

        // TODO update listeners in parallel, blocking for listeners with block=true
        try {
          const listenerRevisions = await transmitter.transmit(
            strandUpdates,
            source,
          );

          listenerState.pendingTimeout = "0";
          listenerState.listenerStatus = "PENDING";

          const lastUpdated = new Date().toISOString();

          for (const revision of listenerRevisions) {
            const syncUnit = syncUnits.find(
              (unit) =>
                revision.documentId === unit.documentId &&
                revision.scope === unit.scope &&
                revision.branch === unit.branch,
            );
            if (syncUnit) {
              listenerState.syncUnits.set(syncUnit.syncId, {
                lastUpdated,
                listenerRev: revision.revision,
              });
            } else {
              logger.warn(
                `Received revision for untracked unit for listener ${listenerState.listener.listenerId}`,
                revision,
              );
            }
          }

          for (const revision of listenerRevisions) {
            const error = revision.status === "ERROR";
            if (revision.error?.includes("Missing operations")) {
              const updates = await this._triggerUpdate(source, onError);
              listenerUpdates.push(...updates);
            } else {
              listenerUpdates.push({
                listenerId: listenerState.listener.listenerId,
                listenerRevisions,
              });
              if (error) {
                throw new OperationError(
                  revision.status as ErrorStatus,
                  undefined,
                  revision.error,
                  revision.error,
                );
              }
            }
          }
          listenerState.listenerStatus = "SUCCESS";
        } catch (e) {
          // TODO: Handle error based on listener params (blocking, retry, etc)
          onError?.(e as Error, driveId, listenerState);
          listenerState.listenerStatus =
            e instanceof OperationError ? e.status : "ERROR";
        }
      }
    }
    return listenerUpdates;
  }

  private _checkFilter(filter: ListenerFilter, syncUnit: SynchronizationUnit) {
    const { branch, documentId, scope, documentType } = syncUnit;
    // TODO: Needs to be optimized
    if (
      (!filter.branch ||
        filter.branch.includes(branch) ||
        filter.branch.includes("*")) &&
      (!filter.documentId ||
        filter.documentId.includes(documentId) ||
        filter.documentId.includes("*")) &&
      (!filter.scope ||
        filter.scope.includes(scope) ||
        filter.scope.includes("*")) &&
      (!filter.documentType ||
        filter.documentType.includes(documentType) ||
        filter.documentType.includes("*"))
    ) {
      return true;
    }
    return false;
  }

  getListenerSyncUnits(driveId: string, listenerId: string) {
    const listener = this.listenerStateByDriveId.get(driveId)?.get(listenerId);
    if (!listener) {
      return [];
    }
    const filter = listener.listener.filter;
    return this.syncManager.getSynchronizationUnits(
      driveId,
      filter.documentId ?? ["*"],
      filter.scope ?? ["*"],
      filter.branch ?? ["*"],
      filter.documentType ?? ["*"],
    );
  }

  getListenerSyncUnitIds(
    driveId: string,
    listenerId: string,
  ): Promise<SynchronizationUnitQuery[]> {
    const listener = this.listenerStateByDriveId.get(driveId)?.get(listenerId);
    if (!listener) {
      return Promise.resolve([]);
    }
    const filter = listener.listener.filter;
    return this.syncManager.getSynchronizationUnitsIds(
      driveId,
      filter.documentId ?? ["*"],
      filter.scope ?? ["*"],
      filter.branch ?? ["*"],
      filter.documentType ?? ["*"],
    );
  }

  async removeDrive(driveId: string): Promise<void> {
    const listenerIdToListenerState = this.listenerStateByDriveId.get(driveId);
    if (!listenerIdToListenerState) {
      return;
    }

    // delete first
    this.listenerStateByDriveId.delete(driveId);

    for (const [_, listenerState] of listenerIdToListenerState) {
      // guarantee that all disconnects are called
      try {
        await listenerState.listener.transmitter?.disconnect?.();
      } catch (error) {
        logger.error(error);
      }
    }
  }

  async getStrands(
    driveId: string,
    listenerId: string,
    options?: GetStrandsOptions,
  ): Promise<StrandUpdate[]> {
    // this will throw if listenerState is not found
    const listenerState = this.getListenerState(driveId, listenerId);

    // fetch operations from drive  and prepare strands
    const strands: StrandUpdate[] = [];

    const syncUnits = await this.getListenerSyncUnits(driveId, listenerId);

    const limit = options?.limit; // maximum number of operations to send across all sync units
    let operationsCount = 0; // total amount of operations that have been retrieved

    const tasks = syncUnits.map((syncUnit) => async () => {
      if (limit && operationsCount >= limit) {
        // break;
        return;
      }
      if (syncUnit.revision < 0) {
        return;
      }
      const entry = listenerState.syncUnits.get(syncUnit.syncId);
      if (entry && entry.listenerRev >= syncUnit.revision) {
        return;
      }

      const { documentId, driveId, scope, branch } = syncUnit;
      try {
        const operations = await this.syncManager.getOperationData(
          // DEAL WITH INVALID SYNC ID ERROR
          driveId,
          syncUnit.syncId,
          {
            since: options?.since,
            fromRevision: options?.fromRevision ?? entry?.listenerRev,
            limit: limit ? limit - operationsCount : undefined,
          },
        );

        if (!operations.length) {
          return;
        }

        operationsCount += operations.length;

        strands.push({
          driveId,
          documentId,
          scope: scope as OperationScope,
          branch,
          operations,
        });
      } catch (error) {
        logger.error(error);
        return;
      }
    });

    if (this.options.sequentialUpdates) {
      for (const task of tasks) {
        await task();
      }
    } else {
      await Promise.all(tasks.map((task) => task()));
    }

    return strands;
  }

  getListenerState(driveId: string, listenerId: string) {
    let listenerStateByListenerId = this.listenerStateByDriveId.get(driveId);
    if (!listenerStateByListenerId) {
      listenerStateByListenerId = new Map();
      this.listenerStateByDriveId.set(driveId, listenerStateByListenerId);
    }

    const listenerState = listenerStateByListenerId.get(listenerId);
    if (!listenerState) {
      throw new Error("Listener not found");
    }

    return listenerState;
  }

  setListenerState(
    driveId: string,
    listenerId: string,
    listenerState: ListenerState,
  ) {
    let listenerStateByListenerId = this.listenerStateByDriveId.get(driveId);
    if (!listenerStateByListenerId) {
      listenerStateByListenerId = new Map();
      this.listenerStateByDriveId.set(driveId, listenerStateByListenerId);
    }

    listenerStateByListenerId.set(listenerId, listenerState);
  }
}
