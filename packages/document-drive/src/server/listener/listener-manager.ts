import type {
  DriveUpdateErrorHandler,
  ErrorStatus,
  GetStrandsOptions,
  IListenerManager,
  ISynchronizationManager,
  ListenerFilter,
  ListenerManagerOptions,
  ListenerState,
  ListenerUpdate,
  OperationUpdate,
  ServerListener,
  StrandUpdate,
  StrandUpdateSource,
  SynchronizationUnit,
  SynchronizationUnitId,
  SyncronizationUnitState,
} from "document-drive";
import { childLogger } from "document-drive/utils/logger";
import { OperationError } from "../error.js";
import { SyncUnitMap } from "../sync-unit-map.js";
import { DefaultListenerManagerOptions } from "./constants.js";
import { debounce } from "./util.js";

export class ListenerManager implements IListenerManager {
  static LISTENER_UPDATE_DELAY = 250;

  protected logger = childLogger([
    "ListenerManager",
    Math.floor(Math.random() * 999).toString(),
  ]);

  protected syncManager: ISynchronizationManager;
  protected options: ListenerManagerOptions;
  public generateJwtHandler?: (driveUrl: string) => Promise<string>;

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

  setGenerateJwtHandler(handler: (driveUrl: string) => Promise<string>) {
    this.generateJwtHandler = handler;
  }

  removeJwtHandler() {
    this.generateJwtHandler = undefined;
  }

  async initialize(handler: DriveUpdateErrorHandler) {
    this.logger.verbose("initialize(...)");

    // if network connect comes back online
    // then triggers the listeners update
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.triggerUpdate(false, { type: "local" }, undefined, handler).catch(
          (error) => {
            this.logger.error(
              "Non handled error updating listeners: @error",
              error,
            );
          },
        );
      });
    }
  }

  driveHasListeners(driveId: string) {
    return this.listenerStateByDriveId.has(driveId);
  }

  async setListener(driveId: string, listener: ServerListener) {
    this.logger.verbose(
      "setListener(drive: @driveId, listener: @listenerId)",
      driveId,
      listener.listenerId,
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
      syncUnits: new SyncUnitMap<SyncronizationUnitState>(),
    });

    await this.triggerUpdate(true, { type: "local" });
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
    parentId: string,
    syncUnits: SynchronizationUnitId[],
  ): Promise<void> {
    const driveMap = this.listenerStateByDriveId.get(parentId);
    if (!driveMap) {
      return;
    }

    // delete sync unit state from listeners
    for (const [, listener] of driveMap) {
      for (const syncUnit of syncUnits) {
        listener.syncUnits.delete(syncUnit);
      }
    }
    return Promise.resolve();
  }

  async updateSynchronizationRevisions(
    syncUnits: SynchronizationUnit[],
    source: StrandUpdateSource,
    willUpdate?: (listeners: ServerListener[]) => void,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
    forceSync = false,
  ) {
    // TODO Do we need to check if listeners are outdated?
    // This method is called when processing an operation.
    // Should we decouple the operation processing from the sync?
    const driveListeners = this.listenerStateByDriveId.values();
    const outdatedListeners: ServerListener[] = [];
    for (const [[_drive, listenerState]] of driveListeners) {
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

        const listenerRev = listenerState.syncUnits.get(syncUnit);

        if (!listenerRev || listenerRev.listenerRev < syncUnit.revision) {
          outdatedListeners.push(listenerState.listener);
          break;
        }
      }
    }

    return this.triggerUpdate(forceSync, source, willUpdate, onError);
  }

  async updateListenerRevision(
    listenerId: string,
    driveId: string,
    syncId: SynchronizationUnitId,
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
    listener.syncUnits.set(syncId, { listenerRev, lastUpdated });

    return Promise.resolve();
  }

  triggerUpdate = debounce(
    this._triggerUpdate.bind(this),
    ListenerManager.LISTENER_UPDATE_DELAY,
  );

  private async _triggerUpdate(
    source: StrandUpdateSource,
    willUpdate?: (listeners: ServerListener[]) => void,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
    maxContinues = 500,
  ) {
    this.logger.verbose(
      "_triggerUpdate(source: @sourceType, maxContinues: @maxContinues) @listenerStateByDriveId",
      source.type,
      maxContinues,
      this.listenerStateByDriveId,
    );

    if (maxContinues < 0) {
      throw new Error("Maximum retries exhausted.");
    }

    const listenerUpdates: ListenerUpdate[] = [];

    for (const [driveId, listenerStateById] of this.listenerStateByDriveId) {
      for (const [listenerId, listenerState] of listenerStateById) {
        const transmitter = listenerState.listener.transmitter;

        if (!transmitter?.transmit) {
          // transmit is optional, so we can skip listeners that don't have a transmitter
          continue;
        }

        const syncUnits = await this.getListenerSyncUnits(driveId, listenerId);
        const strandUpdates: StrandUpdate[] = [];

        this.logger.verbose("syncUnits: @syncUnits", syncUnits);

        // TODO change to push one after the other, reusing operation data
        const tasks = syncUnits.map((syncUnit) => async () => {
          const unitState = listenerState.syncUnits.get(syncUnit);

          if (unitState && unitState.listenerRev >= syncUnit.revision) {
            this.logger.verbose(
              "Abandoning push for sync unit @syncUnit: already up-to-date (@listenerRev >= @revision)",
              syncUnit,
              unitState.listenerRev,
              syncUnit.revision,
            );
            return;
          } else {
            this.logger.verbose(
              "Listener out-of-date for sync unit (@scope, @documentId): @listenerRev < @revision",
              syncUnit.scope,
              syncUnit.documentId,
              unitState?.listenerRev,
              syncUnit.revision,
            );
          }

          const opData: OperationUpdate[] = [];
          if (syncUnit.revision > 0) {
            try {
              const data = await this.syncManager.getOperationData(
                // TODO - join queries, DEAL WITH INVALID SYNC ID ERROR
                syncUnit,
                {
                  fromRevision: unitState?.listenerRev,
                },
              );
              opData.push(...data);
            } catch (e) {
              this.logger.error("@error", e);
            }

            if (!opData.length) {
              this.logger.verbose(
                "Abandoning push for @syncUnit: no operations found",
                syncUnit,
              );
              return;
            }
          }

          strandUpdates.push({
            driveId,
            documentType: syncUnit.documentType,
            documentId: syncUnit.documentId,
            branch: syncUnit.branch,
            operations: opData,
            scope: syncUnit.scope,
          });
        });

        if (this.options.sequentialUpdates) {
          this.logger.verbose(
            "Collecting @count syncUnit strandUpdates in sequence",
            tasks.length,
          );
          for (const task of tasks) {
            await task();
          }
        } else {
          this.logger.verbose(
            "Collecting @count syncUnit strandUpdates in parallel",
            tasks.length,
          );
          await Promise.all(tasks.map((task) => task()));
        }

        if (strandUpdates.length == 0) {
          this.logger.verbose(
            "No strandUpdates needed for listener @listenerId",
            listenerId,
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
            "_triggerUpdate(source: @sourceType) > transmitter.transmit",
            source.type,
          );

          const listenerRevisions = await transmitter.transmit(
            strandUpdates,
            source,
          );

          this.logger.verbose(
            "_triggerUpdate(source: @sourceType) > transmission succeeded: @listenerRevisions",
            source.type,
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
              listenerState.syncUnits.set(syncUnit, {
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
                const suIndex = su.operations.at(-1)?.index;
                if (suIndex !== revision.revision) {
                  this.logger.verbose(
                    "Revision still out-of-date for @documentId:@scope:@branch @suIndex <> @revision",
                    su.documentId,
                    su.scope,
                    su.branch,
                    suIndex,
                    revision.revision,
                  );
                  continuationNeeded = true;
                } else {
                  this.logger.verbose(
                    "Revision match for @documentId:@scope:@branch @suIndex",
                    su.documentId,
                    su.scope,
                    su.branch,
                    suIndex,
                  );
                }
              }
              // Check for revision status ^^
            } else {
              this.logger.warn(
                "Received revision for untracked unit for listener @listenerId: @revision",
                listenerState.listener.listenerId,
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
              willUpdate,
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
      "Returning listener updates (maxContinues: @maxContinues): @listenerUpdates",
      maxContinues,
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
        this.logger.error("@error", error);
      }
    }
  }

  async getStrands(
    driveId: string,
    listenerId: string,
    options?: GetStrandsOptions,
  ): Promise<StrandUpdate[]> {
    // this will throw if listenerState is not found
    this.logger.verbose(
      "[SYNC DEBUG] ListenerManager.getStrands called for drive: @driveId, listener: @listenerId, options: @options",
      driveId,
      listenerId,
      options || {},
    );

    let listenerState;
    try {
      listenerState = this.getListenerState(driveId, listenerId);
      this.logger.verbose(
        "[SYNC DEBUG] Found listener state for drive: @driveId, listener: @listenerId, status: @status",
        driveId,
        listenerId,
        listenerState.listenerStatus,
      );
    } catch (error) {
      this.logger.error(
        "[SYNC DEBUG] Failed to find listener state for drive: @driveId, listener: @listenerId. Error: @error",
        driveId,
        listenerId,
        error,
      );
      throw error;
    }

    // fetch operations from drive  and prepare strands
    const strands: StrandUpdate[] = [];

    try {
      const syncUnits = await this.getListenerSyncUnits(driveId, listenerId);
      this.logger.verbose(
        "[SYNC DEBUG] Retrieved @count sync units for drive: @driveId, listener: @listenerId",
        syncUnits.length,
        driveId,
        listenerId,
      );

      const limit = options?.limit; // maximum number of operations to send across all sync units
      let operationsCount = 0; // total amount of operations that have been retrieved

      const tasks = syncUnits.map((syncUnit) => async () => {
        if (limit && operationsCount >= limit) {
          // break;
          return;
        }
        if (syncUnit.revision < 0) {
          this.logger.verbose(
            "[SYNC DEBUG] Skipping sync unit with negative revision: @syncUnit, revision: @revision",
            syncUnit,
            syncUnit.revision,
          );
          return;
        }
        const entry = listenerState.syncUnits.get(syncUnit);
        if (entry && entry.listenerRev >= syncUnit.revision) {
          this.logger.verbose(
            "[SYNC DEBUG] Skipping sync unit - listener already up to date: @syncUnit, listenerRev: @listenerRev, revision: @revision",
            syncUnit,
            entry.listenerRev,
            syncUnit.revision,
          );
          return;
        }

        const { documentId, scope, branch } = syncUnit;
        let operations: OperationUpdate[] = [];
        try {
          if (syncUnit.revision > 0) {
            this.logger.verbose(
              "[SYNC DEBUG] Getting operations for syncUnit: @syncUnit",
              syncUnit,
            );

            operations = await this.syncManager.getOperationData(
              // DEAL WITH INVALID SYNC ID ERROR
              syncUnit,
              {
                since: options?.since,
                fromRevision: options?.fromRevision ?? entry?.listenerRev,
                limit: limit ? limit - operationsCount : undefined,
              },
            );
          }
          this.logger.verbose(
            "[SYNC DEBUG] Retrieved @count operations for syncUnit: @syncUnit",
            operations.length,
            syncUnit,
          );

          operationsCount += operations.length;

          strands.push({
            driveId,
            documentId,
            documentType: syncUnit.documentType,
            scope: scope,
            branch,
            operations,
          });

          this.logger.verbose(
            "[SYNC DEBUG] Added strand with @count operations for syncUnit: @syncUnit",
            operations.length,
            syncUnit,
          );
        } catch (error) {
          this.logger.error(
            "Error getting operations for syncUnit: @syncUnit, error: @error",
            syncUnit,
            error,
          );
          return;
        }
      });

      if (this.options.sequentialUpdates) {
        this.logger.verbose(
          "[SYNC DEBUG] Processing @count sync units sequentially",
          tasks.length,
        );
        for (const task of tasks) {
          await task();
        }
      } else {
        this.logger.verbose(
          "[SYNC DEBUG] Processing @count sync units in parallel",
          tasks.length,
        );
        await Promise.all(tasks.map((task) => task()));
      }
    } catch (error) {
      this.logger.error("Error in getStrands: @error", error);
    }

    this.logger.verbose(
      "ListenerManager.getStrands returning @count strands for drive: @driveId, listener: @listenerId",
      strands.length,
      driveId,
      listenerId,
    );
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
