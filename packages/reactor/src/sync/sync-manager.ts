import type { Operation } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobWriteReadyEvent } from "../events/types.js";
import type { ILogger } from "../logging/types.js";
import { JobAwaiter } from "../shared/awaiter.js";
import {
  JobStatus,
  type JobInfo,
  type ShutdownStatus,
} from "../shared/types.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
  OperationWithContext,
} from "../storage/interfaces.js";
import { ChannelError } from "./errors.js";
import type { IChannelFactory, ISyncManager, Remote } from "./interfaces.js";
import { SyncAwaiter } from "./sync-awaiter.js";
import { SyncOperation } from "./sync-operation.js";
import type {
  ChannelConfig,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteStatus,
  SyncFailedEvent,
  SyncPendingEvent,
  SyncResult,
  SyncSucceededEvent,
} from "./types.js";
import {
  ChannelErrorSource,
  SyncEventTypes,
  SyncOperationStatus,
} from "./types.js";
import {
  batchOperationsByDocument,
  createIdleHealth,
  filterOperations,
} from "./utils.js";

type JobSyncState = {
  total: number;
  completed: Set<string>;
  failed: Map<
    string,
    { remoteName: string; documentId: string; error: string }
  >;
  remoteNames: string[];
};

export class SyncManager implements ISyncManager {
  private readonly logger: ILogger;
  private readonly remoteStorage: ISyncRemoteStorage;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly channelFactory: IChannelFactory;
  private readonly _operationIndex: IOperationIndex;
  private readonly reactor: IReactor;
  private readonly eventBus: IEventBus;
  private readonly remotes: Map<string, Remote>;
  private readonly awaiter: JobAwaiter;
  private readonly syncAwaiter: SyncAwaiter;
  private readonly jobSyncStates: Map<string, JobSyncState>;
  private isShutdown: boolean;
  private eventUnsubscribe?: () => void;

  public loadJobs: Map<string, JobInfo> = new Map();

  constructor(
    logger: ILogger,
    remoteStorage: ISyncRemoteStorage,
    cursorStorage: ISyncCursorStorage,
    channelFactory: IChannelFactory,
    operationIndex: IOperationIndex,
    reactor: IReactor,
    eventBus: IEventBus,
  ) {
    this.logger = logger;
    this.remoteStorage = remoteStorage;
    this.cursorStorage = cursorStorage;
    this.channelFactory = channelFactory;
    this._operationIndex = operationIndex;
    this.reactor = reactor;
    this.eventBus = eventBus;
    this.remotes = new Map();
    this.awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
      reactor.getJobStatus(jobId, signal),
    );
    this.syncAwaiter = new SyncAwaiter(eventBus);
    this.jobSyncStates = new Map();
    this.isShutdown = false;
  }

  async startup(): Promise<void> {
    if (this.isShutdown) {
      throw new Error("SyncManager is already shutdown and cannot be started");
    }

    const remoteRecords = await this.remoteStorage.list();

    for (const record of remoteRecords) {
      const channel = this.channelFactory.instance(
        record.id,
        record.name,
        record.channelConfig,
        this.cursorStorage,
        record.collectionId,
        record.filter,
        this._operationIndex,
      );

      try {
        await channel.init();
      } catch (error) {
        console.error(
          `Error initializing channel for remote ${record.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const remote: Remote = {
        id: record.id,
        name: record.name,
        collectionId: record.collectionId,
        filter: record.filter,
        options: record.options,
        channel,
      };

      this.remotes.set(record.name, remote);
      this.wireChannelCallbacks(remote);
    }

    this.eventUnsubscribe = this.eventBus.subscribe<JobWriteReadyEvent>(
      ReactorEventTypes.JOB_WRITE_READY,
      (_type, event) => this.handleWriteReady(event),
    );
  }

  shutdown(): ShutdownStatus {
    this.isShutdown = true;

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = undefined;
    }

    this.awaiter.shutdown();
    this.syncAwaiter.shutdown();

    for (const remote of this.remotes.values()) {
      try {
        remote.channel.shutdown();
      } catch (error) {
        console.error(
          `Error shutting down channel for remote ${remote.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.remotes.clear();

    return {
      isShutdown: true,
      completed: Promise.resolve(),
    };
  }

  getByName(name: string): Remote {
    const remote = this.remotes.get(name);
    if (!remote) {
      throw new Error(`Remote with name '${name}' does not exist`);
    }
    return remote;
  }

  getById(id: string): Remote {
    for (const remote of this.remotes.values()) {
      if (remote.id === id) {
        return remote;
      }
    }
    throw new Error(`Remote with id '${id}' does not exist`);
  }

  async add(
    name: string,
    collectionId: string,
    channelConfig: ChannelConfig,
    filter: RemoteFilter = { documentId: [], scope: [], branch: "" },
    options: RemoteOptions = { sinceTimestampUtcMs: "0" },
    id?: string,
  ): Promise<Remote> {
    if (this.isShutdown) {
      throw new Error("SyncManager is shutdown and cannot add remotes");
    }

    if (this.remotes.has(name)) {
      throw new Error(`Remote with name '${name}' already exists`);
    }

    this.logger.debug(
      "Adding remote (@name, @collectionId, @channelConfig, @filter, @options, @id)",
      name,
      collectionId,
      channelConfig,
      filter,
      options,
      id,
    );

    const remoteId = id ?? crypto.randomUUID();

    const status: RemoteStatus = {
      push: createIdleHealth(),
      pull: createIdleHealth(),
    };

    const remoteRecord: RemoteRecord = {
      id: remoteId,
      name,
      collectionId,
      channelConfig,
      filter,
      options,
      status,
    };

    await this.remoteStorage.upsert(remoteRecord);

    const channel = this.channelFactory.instance(
      remoteId,
      name,
      channelConfig,
      this.cursorStorage,
      collectionId,
      filter,
      this._operationIndex,
    );

    await channel.init();

    const remote: Remote = {
      id: remoteId,
      name,
      collectionId,
      filter,
      options,
      channel,
    };

    this.remotes.set(name, remote);
    this.wireChannelCallbacks(remote);

    await this.backfillOutbox(
      remote,
      collectionId,
      filter,
      options.sinceTimestampUtcMs,
    );

    return remote;
  }

  private async backfillOutbox(
    remote: Remote,
    collectionId: string,
    filter: RemoteFilter,
    sinceTimestampUtcMs: string,
  ): Promise<void> {
    let historicalOps;
    try {
      historicalOps = await this._operationIndex.find(collectionId);
    } catch {
      return;
    }

    if (historicalOps.results.length === 0) {
      return;
    }

    const opsWithContext = historicalOps.results.map((entry) => ({
      operation: {
        id: entry.id,
        index: entry.index,
        skip: entry.skip,
        hash: entry.hash,
        timestampUtcMs: entry.timestampUtcMs,
        action: entry.action,
      } as Operation,
      context: {
        documentId: entry.documentId,
        documentType: entry.documentType,
        scope: entry.scope,
        branch: entry.branch,
        ordinal: entry.ordinal ?? 0,
      },
    }));

    let filteredOps = filterOperations(opsWithContext, filter);

    filteredOps = filteredOps.filter(
      (op) => op.operation.timestampUtcMs > sinceTimestampUtcMs,
    );

    if (filteredOps.length === 0) {
      return;
    }

    const batches = batchOperationsByDocument(filteredOps);

    for (const batch of batches) {
      const syncOp = new SyncOperation(
        crypto.randomUUID(),
        "",
        remote.name,
        batch.documentId,
        [batch.scope],
        batch.branch,
        batch.operations,
      );
      remote.channel.outbox.add(syncOp);
    }
  }

  async remove(name: string): Promise<void> {
    const remote = this.remotes.get(name);
    if (!remote) {
      throw new Error(`Remote with name '${name}' does not exist`);
    }

    await this.remoteStorage.remove(name);

    remote.channel.shutdown();
    this.remotes.delete(name);
  }

  list(): Remote[] {
    return Array.from(this.remotes.values());
  }

  waitForSync(jobId: string, signal?: AbortSignal): Promise<SyncResult> {
    return this.syncAwaiter.waitForSync(jobId, signal);
  }

  private wireChannelCallbacks(remote: Remote): void {
    remote.channel.inbox.onAdded((syncOps) => {
      for (const syncOp of syncOps) {
        this.handleInboxJob(remote, syncOp);
      }
    });

    remote.channel.outbox.onAdded((syncOps) => {
      for (const syncOp of syncOps) {
        this.handleOutboxJob(remote, syncOp);
      }
    });
  }

  private handleWriteReady(event: JobWriteReadyEvent): void {
    if (this.isShutdown) {
      return;
    }

    const sourceRemote = event.jobMeta?.sourceRemote as string | undefined;
    const syncOpsWithRemote: Array<{ syncOp: SyncOperation; remote: Remote }> =
      [];
    const remoteNames: string[] = [];

    for (const remote of this.remotes.values()) {
      if (sourceRemote && remote.name === sourceRemote) {
        continue;
      }

      let filteredOps = filterOperations(event.operations, remote.filter);
      if (filteredOps.length === 0) {
        continue;
      }

      // If remote has empty documentId filter, it means "sync all docs in this collection"
      // In this case, we need to filter by collection membership
      if (remote.filter.documentId.length === 0) {
        filteredOps = this.filterByCollectionMembership(
          filteredOps,
          remote.collectionId,
          event.collectionMemberships,
        );
        if (filteredOps.length === 0) {
          continue;
        }
      }

      const batches = batchOperationsByDocument(filteredOps);

      for (const batch of batches) {
        const syncOp = new SyncOperation(
          crypto.randomUUID(),
          event.jobId,
          remote.name,
          batch.documentId,
          [batch.scope],
          batch.branch,
          batch.operations,
        );

        syncOpsWithRemote.push({ syncOp, remote });
        if (!remoteNames.includes(remote.name)) {
          remoteNames.push(remote.name);
        }
      }
    }

    if (syncOpsWithRemote.length > 0 && event.jobId) {
      this.jobSyncStates.set(event.jobId, {
        total: syncOpsWithRemote.length,
        completed: new Set(),
        failed: new Map(),
        remoteNames,
      });
      const pendingEvent: SyncPendingEvent = {
        jobId: event.jobId,
        syncOperationCount: syncOpsWithRemote.length,
        remoteNames,
      };
      void this.eventBus.emit(SyncEventTypes.SYNC_PENDING, pendingEvent);
    }

    for (const { syncOp, remote } of syncOpsWithRemote) {
      syncOp.on((op, _prev, next) => {
        if (next === SyncOperationStatus.Applied) {
          this.markSyncOpCompleted(op.jobId, op.id, true);
        } else if (next === SyncOperationStatus.Error) {
          this.markSyncOpCompleted(op.jobId, op.id, false, {
            remoteName: op.remoteName,
            documentId: op.documentId,
            error: op.error?.message ?? "Unknown error",
          });
        }
      });

      remote.channel.outbox.add(syncOp);
    }
  }

  private handleInboxJob(remote: Remote, syncOp: SyncOperation): void {
    if (this.isShutdown) {
      return;
    }

    void this.applyInboxJob(remote, syncOp);
  }

  private handleOutboxJob(remote: Remote, syncOp: SyncOperation): void {
    syncOp.on((syncOp, _prev, next) => {
      if (next === SyncOperationStatus.Applied) {
        remote.channel.outbox.remove(syncOp);
      } else if (next === SyncOperationStatus.Error) {
        remote.channel.outbox.remove(syncOp);
      }
    });
  }

  private async applyInboxJob(
    remote: Remote,
    syncOp: SyncOperation,
  ): Promise<void> {
    const operations: Operation[] = syncOp.operations.map((op) => op.operation);

    let jobInfo;
    try {
      jobInfo = await this.reactor.load(
        syncOp.documentId,
        syncOp.branch,
        operations,
        undefined,
        { sourceRemote: remote.name },
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Inbox, err);
      syncOp.failed(channelError);
      remote.channel.deadLetter.add(syncOp);
      remote.channel.inbox.remove(syncOp);
      return;
    }

    let completedJobInfo;
    try {
      completedJobInfo = await this.awaiter.waitForJob(jobInfo.id);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Inbox, err);
      syncOp.failed(channelError);
      remote.channel.deadLetter.add(syncOp);
      remote.channel.inbox.remove(syncOp);
      return;
    }

    const jobKey = `${syncOp.documentId}:${syncOp.branch}`;
    this.loadJobs.set(jobKey, completedJobInfo);

    if (completedJobInfo.status === JobStatus.FAILED) {
      const error = new ChannelError(
        ChannelErrorSource.Inbox,
        new Error(
          `Failed to apply operations: ${completedJobInfo.error?.message || "Unknown error"}`,
        ),
      );
      syncOp.failed(error);
      remote.channel.deadLetter.add(syncOp);
    } else {
      syncOp.executed();
    }

    remote.channel.inbox.remove(syncOp);
  }

  private markSyncOpCompleted(
    jobId: string,
    syncOpId: string,
    success: boolean,
    errorInfo?: { remoteName: string; documentId: string; error: string },
  ): void {
    if (!jobId) {
      return;
    }

    const state = this.jobSyncStates.get(jobId);
    if (!state) {
      return;
    }

    if (success) {
      state.completed.add(syncOpId);
    } else if (errorInfo) {
      state.failed.set(syncOpId, errorInfo);
    }

    const totalTerminal = state.completed.size + state.failed.size;
    if (totalTerminal === state.total) {
      if (state.failed.size === 0) {
        const succeededEvent: SyncSucceededEvent = {
          jobId,
          syncOperationCount: state.total,
        };
        void this.eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, succeededEvent);
      } else {
        const failedEvent: SyncFailedEvent = {
          jobId,
          successCount: state.completed.size,
          failureCount: state.failed.size,
          errors: Array.from(state.failed.values()),
        };
        void this.eventBus.emit(SyncEventTypes.SYNC_FAILED, failedEvent);
      }
      this.jobSyncStates.delete(jobId);
    }
  }

  private filterByCollectionMembership(
    operations: OperationWithContext[],
    collectionId: string,
    collectionMemberships?: Record<string, string[]>,
  ): OperationWithContext[] {
    // If no collection memberships provided, we can't verify membership
    // This maintains backwards compatibility but effectively disables routing
    // for remotes with empty documentId filter when membership info is missing
    if (!collectionMemberships) {
      return [];
    }

    return operations.filter((op) => {
      const documentId = op.context.documentId;
      if (!(documentId in collectionMemberships)) {
        return false;
      }
      return collectionMemberships[documentId].includes(collectionId);
    });
  }
}
