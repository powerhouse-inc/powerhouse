import { OperationError } from "#server/error";
import { type StrandUpdateSource } from "#server/listener/transmitter/types";
import {
  DefaultListenerManagerOptions,
  type DriveUpdateErrorHandler,
  type ErrorStatus,
  type GetStrandsOptions,
  type IListenerManager,
  type ISynchronizationManager,
  type Listener,
  type ListenerManagerOptions,
  type ListenerState,
  type ListenerUpdate,
  type OperationUpdate,
  type StrandUpdate,
  type SynchronizationUnit,
  type SynchronizationUnitQuery,
} from "#server/types";
import { childLogger, type ListenerFilter } from "document-drive";
import { type OperationScope } from "document-model";
import { debounce } from "./util.js";

const ENABLE_SYNC_DEBUG = false;

export class ListenerManager implements IListenerManager {
  static LISTENER_UPDATE_DELAY = 250;

  protected logger = childLogger([
    "ListenerManager",
    Math.floor(Math.random() * 999).toString(),
  ]);

  protected syncManager: ISynchronizationManager;
  protected options: ListenerManagerOptions;

  // driveId -> listenerId -> listenerState
  protected listenerStateByDriveId = new Map<
    string,
    Map<string, ListenerState>
  >();

  constructor(
    syncManager: ISynchronizationManager,
    options: ListenerManagerOptions = DefaultListenerManagerOptions,
  ) {
    this.syncManager = syncManager;
    this.options = { ...DefaultListenerManagerOptions, ...options };

    this.logger.verbose(`constructor(...)`);
  }

  async initialize(handler: DriveUpdateErrorHandler) {
    this.logger.verbose("initialize(...)");

    // if network connect comes back online
    // then triggers the listeners update
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.triggerUpdate(false, { type: "local" }, handler).catch((error) => {
          this.logger.error("Non handled error updating listeners", error);
        });
      });
    }
  }

  driveHasListeners(driveId: string) {
    return this.listenerStateByDriveId.has(driveId);
  }

  async setListener(driveId: string, listener: Listener) {
    this.logger.verbose(
      `setListener(drive: ${driveId}, listener: ${listener.listenerId})`,
    );

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
    this.logger.verbose("setListener()");

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
    maxContinues = 500,
  ) {
    this.logger.verbose(
      `_triggerUpdate(source: ${source.type}, maxContinues: ${maxContinues})`,
      this.listenerStateByDriveId,
    );

    if (maxContinues < 0) {
      throw new Error("Maximum retries exhausted.");
    }

    const listenerUpdates: ListenerUpdate[] = [];

    for (const [driveId, drive] of this.listenerStateByDriveId) {
      for (const [listenerId, listenerState] of drive) {
        const transmitter = listenerState.listener.transmitter;

        if (!transmitter?.transmit) {
          this.logger.verbose(`Transmitter not set on listener: ${listenerId}`);
          continue;
        }

        const syncUnits = await this.getListenerSyncUnits(driveId, listenerId);
        const strandUpdates: StrandUpdate[] = [];

        this.logger.verbose("syncUnits", syncUnits);

        // TODO change to push one after the other, reusing operation data
        const tasks = syncUnits.map((syncUnit) => async () => {
          const unitState = listenerState.syncUnits.get(syncUnit.syncId);

          if (unitState && unitState.listenerRev >= syncUnit.revision) {
            this.logger.verbose(
              `Abandoning push for sync unit ${syncUnit.syncId}: already up-to-date (${unitState.listenerRev} >= ${syncUnit.revision})`,
            );
            return;
          } else {
            this.logger.verbose(
              `Listener out-of-date for sync unit (${syncUnit.driveId}, ${syncUnit.scope}, ${syncUnit.documentId}): ${unitState?.listenerRev} < ${syncUnit.revision}`,
            );
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
            this.logger.error(e);
          }

          if (!opData.length) {
            this.logger.verbose(
              `Abandoning push for ${syncUnit.syncId}: no operations found`,
            );
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
          this.logger.verbose(
            `Collecting ${tasks.length} syncUnit strandUpdates in sequence`,
          );
          for (const task of tasks) {
            await task();
          }
        } else {
          this.logger.verbose(
            `Collecting ${tasks.length} syncUnit strandUpdates in parallel`,
          );
          await Promise.all(tasks.map((task) => task()));
        }

        if (strandUpdates.length == 0) {
          this.logger.verbose(
            `No strandUpdates needed for listener ${listenerId}`,
          );
          continue;
        }

        listenerState.pendingTimeout = new Date(
          new Date().getTime() / 1000 + 300,
        ).toISOString();

        listenerState.listenerStatus = "PENDING";

        // TODO update listeners in parallel, blocking for listeners with block=true
        try {
          this.logger.verbose(
            `_triggerUpdate(source: ${source.type}) > transmitter.transmit`,
          );

          const listenerRevisions = await transmitter.transmit(
            strandUpdates,
            source,
          );

          this.logger.verbose(
            `_triggerUpdate(source: ${source.type}) > transmission succeeded`,
            listenerRevisions,
          );

          listenerState.pendingTimeout = "0";
          listenerState.listenerStatus = "PENDING";

          const lastUpdated = new Date().toISOString();
          let continuationNeeded = false;

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

              // Check for revision status vv
              const su = strandUpdates.find(
                (su) =>
                  su.driveId === revision.driveId &&
                  su.documentId === revision.documentId &&
                  su.scope === revision.scope &&
                  su.branch === revision.branch,
              );

              if (su && su.operations.length > 0) {
                const suIndex = su.operations.at(
                  su.operations.length - 1,
                )?.index;
                if (suIndex !== revision.revision) {
                  this.logger.verbose(
                    `Revision still out-of-date for ${su.documentId}:${su.scope}:${su.branch} ${suIndex} <> ${revision.revision}`,
                  );
                  continuationNeeded = true;
                } else {
                  this.logger.verbose(
                    `Revision match for ${su.documentId}:${su.scope}:${su.branch} ${suIndex}`,
                  );
                }
              } else {
                this.logger.verbose(
                  `Cannot find strand update for (${revision.documentId}:${revision.scope}:${revision.branch} in drive ${revision.driveId})`,
                );
              }
              // Check for revision status ^^
            } else {
              this.logger.warn(
                `Received revision for untracked unit for listener ${listenerState.listener.listenerId}`,
                revision,
              );
            }
          }

          for (const revision of listenerRevisions) {
            const error = revision.status === "ERROR";
            if (revision.error?.includes("Missing operations")) {
              continuationNeeded = true;
            } else if (error) {
              throw new OperationError(
                revision.status as ErrorStatus,
                undefined,
                revision.error,
                revision.error,
              );
            }
          }

          if (!continuationNeeded) {
            listenerUpdates.push({
              listenerId: listenerState.listener.listenerId,
              listenerRevisions,
            });
          } else {
            const updates = await this._triggerUpdate(
              source,
              onError,
              maxContinues - 1,
            );
            listenerUpdates.push(...updates);
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

    this.logger.verbose(
      `Returning listener updates (maxContinues: ${maxContinues})`,
      listenerUpdates,
    );

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
        this.logger.error(error);
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
        this.logger.error(error);
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
