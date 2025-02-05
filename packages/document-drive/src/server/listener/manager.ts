import {
  DocumentDriveDocument,
  DocumentDriveState,
  ListenerFilter,
} from "document-model-libs/document-drive";
import { OperationScope } from "document-model/document";
import { logger } from "../../utils/logger";
import { OperationError } from "../error";
import {
  DefaultListenerManagerOptions,
  ErrorStatus,
  GetStrandsOptions,
  IBaseDocumentDriveServer,
  IListenerManager,
  Listener,
  ListenerManagerOptions,
  ListenerState,
  ListenerUpdate,
  OperationUpdate,
  StrandUpdate,
  SynchronizationUnit,
} from "../types";
import { ITransmitter, StrandUpdateSource } from "./transmitter/types";

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

  protected drive: IBaseDocumentDriveServer;
  protected listenerState = new Map<string, Map<string, ListenerState>>();
  protected options: ListenerManagerOptions;
  protected transmitters: Record<
    DocumentDriveState["id"],
    Record<Listener["listenerId"], ITransmitter>
  > = {};

  constructor(
    drive: IBaseDocumentDriveServer,
    listenerState = new Map<string, Map<string, ListenerState>>(),
    options: ListenerManagerOptions = DefaultListenerManagerOptions,
  ) {
    this.drive = drive;
    this.listenerState = listenerState;
    this.options = { ...DefaultListenerManagerOptions, ...options };
  }

  driveHasListeners(driveId: string) {
    return this.listenerState.has(driveId);
  }

  getListener(driveId: string, listenerId: string): Promise<ListenerState> {
    const drive = this.listenerState.get(driveId);
    if (!drive) throw new Error("Drive not found");
    const listener = drive.get(listenerId);
    if (!listener) throw new Error("Listener not found");
    return Promise.resolve(listener);
  }

  async setListener(driveId: string, listener: Listener) {
    // this is temporary
    if (driveId !== listener.driveId) {
      throw new Error("Drive ID mismatch");
    }

    if (!this.listenerState.has(driveId)) {
      this.listenerState.set(driveId, new Map());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const driveMap = this.listenerState.get(driveId)!;
    driveMap.set(listener.listenerId, {
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
    const driveMap = this.listenerState.get(driveId);
    if (!driveMap) {
      return false;
    }

    return Promise.resolve(driveMap.delete(listenerId));
  }

  async setTransmitter(
    driveId: string,
    listenerId: string,
    transmitter: ITransmitter,
  ) {
    const driveTransmitters = this.transmitters[driveId] || {};
    driveTransmitters[listenerId] = transmitter;
    this.transmitters[driveId] = driveTransmitters;

    this.triggerUpdate(true, { type: "local" });
  }

  async removeTransmitter(driveId: string, listenerId: string) {
    const driveTransmitters = this.transmitters[driveId];
    if (!driveTransmitters) {
      return false;
    }

    if (delete driveTransmitters[listenerId]) {
      this.transmitters[driveId] = driveTransmitters;

      return true;
    }

    return false;
  }

  async getTransmitter(
    driveId: string,
    listenerId: string,
  ): Promise<ITransmitter | undefined> {
    return Promise.resolve(this.transmitters[driveId]?.[listenerId]);
  }

  async removeSyncUnits(
    driveId: string,
    syncUnits: Pick<SynchronizationUnit, "syncId">[],
  ) {
    const listeners = this.listenerState.get(driveId);
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
    const drive = this.listenerState.get(driveId);
    if (!drive) {
      return [];
    }

    const outdatedListeners: Listener[] = [];
    for (const [, listener] of drive) {
      if (
        outdatedListeners.find(
          (l) => l.listenerId === listener.listener.listenerId,
        )
      ) {
        continue;
      }

      const transmitter = await this.getTransmitter(
        driveId,
        listener.listener.listenerId,
      );
      if (!transmitter?.transmit) {
        continue;
      }

      for (const syncUnit of syncUnits) {
        if (!this._checkFilter(listener.listener.filter, syncUnit)) {
          continue;
        }

        const listenerRev = listener.syncUnits.get(syncUnit.syncId);

        if (!listenerRev || listenerRev.listenerRev < syncUnit.revision) {
          outdatedListeners.push(listener.listener);
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
    const drive = this.listenerState.get(driveId);
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
    for (const [driveId, drive] of this.listenerState) {
      for (const [id, listener] of drive) {
        const transmitter = await this.getTransmitter(driveId, id);
        if (!transmitter?.transmit) {
          continue;
        }

        const syncUnits = await this.getListenerSyncUnits(
          driveId,
          listener.listener.listenerId,
        );

        const strandUpdates: StrandUpdate[] = [];
        // TODO change to push one after the other, reusing operation data
        const tasks = syncUnits.map((syncUnit) => async () => {
          const unitState = listener.syncUnits.get(syncUnit.syncId);

          if (unitState && unitState.listenerRev >= syncUnit.revision) {
            return;
          }

          const opData: OperationUpdate[] = [];
          try {
            const data = await this.drive.getOperationData(
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

        listener.pendingTimeout = new Date(
          new Date().getTime() / 1000 + 300,
        ).toISOString();
        listener.listenerStatus = "PENDING";

        // TODO update listeners in parallel, blocking for listeners with block=true
        try {
          const listenerRevisions = await transmitter.transmit(
            strandUpdates,
            source,
          );

          listener.pendingTimeout = "0";
          listener.listenerStatus = "PENDING";

          const lastUpdated = new Date().toISOString();

          for (const revision of listenerRevisions) {
            const syncUnit = syncUnits.find(
              (unit) =>
                revision.documentId === unit.documentId &&
                revision.scope === unit.scope &&
                revision.branch === unit.branch,
            );
            if (syncUnit) {
              listener.syncUnits.set(syncUnit.syncId, {
                lastUpdated,
                listenerRev: revision.revision,
              });
            } else {
              logger.warn(
                `Received revision for untracked unit for listener ${listener.listener.listenerId}`,
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
                listenerId: listener.listener.listenerId,
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
          listener.listenerStatus = "SUCCESS";
        } catch (e) {
          // TODO: Handle error based on listener params (blocking, retry, etc)
          onError?.(e as Error, driveId, listener);
          listener.listenerStatus =
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

  getListenerSyncUnits(
    driveId: string,
    listenerId: string,
    loadedDrive?: DocumentDriveDocument,
  ) {
    const listener = this.listenerState.get(driveId)?.get(listenerId);
    if (!listener) {
      return [];
    }
    const filter = listener.listener.filter;
    return this.drive.getSynchronizationUnits(
      driveId,
      filter.documentId ?? ["*"],
      filter.scope ?? ["*"],
      filter.branch ?? ["*"],
      filter.documentType ?? ["*"],
      loadedDrive,
    );
  }

  getListenerSyncUnitIds(driveId: string, listenerId: string) {
    const listener = this.listenerState.get(driveId)?.get(listenerId);
    if (!listener) {
      return [];
    }
    const filter = listener.listener.filter;
    return this.drive.getSynchronizationUnitsIds(
      driveId,
      filter.documentId ?? ["*"],
      filter.scope ?? ["*"],
      filter.branch ?? ["*"],
      filter.documentType ?? ["*"],
    );
  }

  async removeDrive(driveId: string): Promise<void> {
    this.listenerState.delete(driveId);
    const transmitters = this.transmitters[driveId];
    if (transmitters) {
      await Promise.all(
        Object.values(transmitters).map((t) => t.disconnect?.()),
      );
    }
  }

  async getStrands(
    driveId: string,
    listenerId: string,
    options?: GetStrandsOptions,
  ): Promise<StrandUpdate[]> {
    // fetch listenerState from listenerManager
    const listener = await this.getListener(driveId, listenerId);

    // fetch operations from drive  and prepare strands
    const strands: StrandUpdate[] = [];

    const drive = await this.drive.getDrive(driveId);
    const syncUnits = await this.getListenerSyncUnits(
      driveId,
      listenerId,
      drive,
    );

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
      const entry = listener.syncUnits.get(syncUnit.syncId);
      if (entry && entry.listenerRev >= syncUnit.revision) {
        return;
      }

      const { documentId, driveId, scope, branch } = syncUnit;
      try {
        const operations = await this.drive.getOperationData(
          // DEAL WITH INVALID SYNC ID ERROR
          driveId,
          syncUnit.syncId,
          {
            since: options?.since,
            fromRevision: options?.fromRevision ?? entry?.listenerRev,
            limit: limit ? limit - operationsCount : undefined,
          },
          drive,
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
}
