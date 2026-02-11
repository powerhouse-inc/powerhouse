import type { Operation, OperationWithContext } from "document-model";
import {
  driveCollectionId,
  type IOperationIndex,
  type OperationIndexEntry,
} from "../cache/operation-index-types.js";
import type {
  BatchLoadRequest,
  BatchLoadResult,
  IReactor,
} from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobFailedEvent,
  type JobWriteReadyEvent,
} from "../events/types.js";
import type { ILogger } from "../logging/types.js";
import { JobAwaiter } from "../shared/awaiter.js";
import { BatchAggregator } from "./batch-aggregator.js";
import {
  JobStatus,
  type JobInfo,
  type ShutdownStatus,
} from "../shared/types.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
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

type IndexSyncBuildOptions = {
  maxOrdinal?: number;
  sinceTimestampUtcMs?: string;
  fallbackOperations?: OperationWithContext[];
};

const INDEX_PAGE_LIMIT = 500;

export class SyncManager implements ISyncManager {
  private readonly logger: ILogger;
  private readonly remoteStorage: ISyncRemoteStorage;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly channelFactory: IChannelFactory;
  private readonly operationIndex: IOperationIndex;
  private readonly reactor: IReactor;
  private readonly eventBus: IEventBus;
  private readonly remotes: Map<string, Remote>;
  private readonly awaiter: JobAwaiter;
  private readonly syncAwaiter: SyncAwaiter;
  private readonly jobSyncStates: Map<string, JobSyncState>;
  private isShutdown: boolean;
  private eventUnsubscribe?: () => void;
  private failedEventUnsubscribe?: () => void;
  private readonly batchAggregator: BatchAggregator;

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
    this.operationIndex = operationIndex;
    this.reactor = reactor;
    this.eventBus = eventBus;
    this.remotes = new Map();
    this.awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
      reactor.getJobStatus(jobId, signal),
    );
    this.syncAwaiter = new SyncAwaiter(eventBus);
    this.jobSyncStates = new Map();
    this.isShutdown = false;
    this.batchAggregator = new BatchAggregator(logger, (events) =>
      this.processCompleteBatch(events),
    );
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
        this.operationIndex,
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
      async (_type, event) => this.batchAggregator.enqueueWriteReady(event),
    );

    this.failedEventUnsubscribe = this.eventBus.subscribe<JobFailedEvent>(
      ReactorEventTypes.JOB_FAILED,
      async (_type, event) => this.batchAggregator.handleJobFailed(event),
    );
  }

  shutdown(): ShutdownStatus {
    this.isShutdown = true;
    this.batchAggregator.clear();

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = undefined;
    }

    if (this.failedEventUnsubscribe) {
      this.failedEventUnsubscribe();
      this.failedEventUnsubscribe = undefined;
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
      this.operationIndex,
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

    await this.backfillOutbox(remote, options.sinceTimestampUtcMs);

    return remote;
  }

  private async backfillOutbox(
    remote: Remote,
    sinceTimestampUtcMs: string,
  ): Promise<void> {
    const syncOps = await this.buildSyncOpsFromIndex(remote, "", [], {
      sinceTimestampUtcMs,
    });

    if (syncOps.length === 0) {
      return;
    }

    let maxOrdinal = 0;
    for (const syncOp of syncOps) {
      remote.channel.outbox.add(syncOp);
      maxOrdinal = Math.max(maxOrdinal, this.getMaxOrdinal(syncOp.operations));
    }

    if (maxOrdinal > 0) {
      await this.setOutboxCheckpoint(remote.name, maxOrdinal);
    }
  }

  async remove(name: string): Promise<void> {
    const remote = this.remotes.get(name);
    if (!remote) {
      throw new Error(`Remote with name '${name}' does not exist`);
    }

    await this.remoteStorage.remove(name);
    await this.cursorStorage.remove(name);

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
      this.handleInboxAdded(remote, syncOps);
    });

    remote.channel.outbox.onAdded((syncOps) => {
      for (const syncOp of syncOps) {
        this.handleOutboxJob(remote, syncOp);
      }
    });
  }

  private async processCompleteBatch(
    events: JobWriteReadyEvent[],
  ): Promise<void> {
    const isBatch = events.length > 1;

    const mergedMemberships = this.mergeCollectionMemberships(events);

    const priorJobIds: string[] = [];

    for (const event of events) {
      const sourceRemote = event.jobMeta.sourceRemote as string | undefined;
      const jobDependencies = isBatch ? [...priorJobIds] : [];
      const maxEventOrdinal = this.getMaxOrdinal(event.operations);
      const remotePlans: Array<{ remote: Remote; syncOps: SyncOperation[] }> =
        [];

      for (const { remote, filteredOperations } of this.getAffectedRemotes(
        event,
        mergedMemberships,
        sourceRemote,
      )) {
        const syncOps = await this.buildSyncOpsFromIndex(
          remote,
          event.jobId,
          jobDependencies,
          {
            maxOrdinal: maxEventOrdinal > 0 ? maxEventOrdinal : undefined,
            fallbackOperations: filteredOperations,
          },
        );

        if (syncOps.length > 0) {
          remotePlans.push({ remote, syncOps });
        }
      }

      const syncOpsWithRemote = remotePlans.flatMap((plan) =>
        plan.syncOps.map((syncOp) => ({ syncOp, remote: plan.remote })),
      );
      const remoteNames = [
        ...new Set(remotePlans.map((plan) => plan.remote.name)),
      ];

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

      const checkpointUpdates = new Map<string, number>();
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
        const maxSyncOpOrdinal = this.getMaxOrdinal(syncOp.operations);
        const previousMax = checkpointUpdates.get(remote.name) ?? 0;
        if (maxSyncOpOrdinal > previousMax) {
          checkpointUpdates.set(remote.name, maxSyncOpOrdinal);
        }
      }

      for (const [remoteName, maxOrdinal] of checkpointUpdates) {
        await this.setOutboxCheckpoint(remoteName, maxOrdinal);
      }

      if (isBatch && event.jobId) {
        priorJobIds.push(event.jobId);
      }
    }
  }

  private handleInboxAdded(remote: Remote, syncOps: SyncOperation[]): void {
    if (this.isShutdown) {
      return;
    }

    const keyed: SyncOperation[] = [];
    const nonKeyed: SyncOperation[] = [];

    for (const syncOp of syncOps) {
      if (syncOp.jobId) {
        keyed.push(syncOp);
      } else {
        nonKeyed.push(syncOp);
      }
    }

    for (const syncOp of nonKeyed) {
      void this.applyInboxJob(remote, syncOp);
    }

    if (keyed.length > 0) {
      void this.applyInboxBatch(keyed.map((syncOp) => ({ remote, syncOp })));
    }
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
      this.logger.error(
        "Failed to load operations from inbox (@remote, @documentId, @error)",
        remote.name,
        syncOp.documentId,
        err.message,
      );
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
      this.logger.error(
        "Failed to wait for job completion (@remote, @documentId, @jobId, @error)",
        remote.name,
        syncOp.documentId,
        jobInfo.id,
        err.message,
      );
      const channelError = new ChannelError(ChannelErrorSource.Inbox, err);
      syncOp.failed(channelError);
      remote.channel.deadLetter.add(syncOp);
      remote.channel.inbox.remove(syncOp);
      return;
    }

    const jobKey = `${syncOp.documentId}:${syncOp.branch}`;
    this.loadJobs.set(jobKey, completedJobInfo);

    if (completedJobInfo.status === JobStatus.FAILED) {
      const errorMessage = completedJobInfo.error?.message || "Unknown error";
      this.logger.error(
        "Failed to apply operations from inbox (@remote, @documentId, @jobId, @error)",
        remote.name,
        syncOp.documentId,
        completedJobInfo.id,
        errorMessage,
      );
      const error = new ChannelError(
        ChannelErrorSource.Inbox,
        new Error(`Failed to apply operations: ${errorMessage}`),
      );
      syncOp.failed(error);
      remote.channel.deadLetter.add(syncOp);
    } else {
      syncOp.executed();
    }

    remote.channel.inbox.remove(syncOp);
  }

  private async applyInboxBatch(
    items: Array<{ remote: Remote; syncOp: SyncOperation }>,
  ): Promise<void> {
    const sourceRemote = items[0].remote.name;

    const jobs = items.map(({ syncOp }) => ({
      key: syncOp.jobId,
      documentId: syncOp.documentId,
      scope: syncOp.scopes[0],
      branch: syncOp.branch,
      operations: syncOp.operations.map((op) => op.operation),
      dependsOn: syncOp.jobDependencies,
    }));

    const request: BatchLoadRequest = { jobs };

    let result: BatchLoadResult;
    try {
      result = await this.reactor.loadBatch(request, undefined, {
        sourceRemote,
      });
    } catch (error) {
      for (const { remote, syncOp } of items) {
        const err = error instanceof Error ? error : new Error(String(error));
        syncOp.failed(new ChannelError(ChannelErrorSource.Inbox, err));
        remote.channel.deadLetter.add(syncOp);
        remote.channel.inbox.remove(syncOp);
      }
      return;
    }

    for (const { remote, syncOp } of items) {
      if (!(syncOp.jobId in result.jobs)) {
        continue;
      }
      const jobInfo = result.jobs[syncOp.jobId];

      let completedJobInfo;
      try {
        completedJobInfo = await this.awaiter.waitForJob(jobInfo.id);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        syncOp.failed(new ChannelError(ChannelErrorSource.Inbox, err));
        remote.channel.deadLetter.add(syncOp);
        remote.channel.inbox.remove(syncOp);
        continue;
      }

      const jobKey = `${syncOp.documentId}:${syncOp.branch}`;
      this.loadJobs.set(jobKey, completedJobInfo);

      if (completedJobInfo.status === JobStatus.FAILED) {
        const errorMessage = completedJobInfo.error?.message || "Unknown error";
        const channelError = new ChannelError(
          ChannelErrorSource.Inbox,
          new Error(`Failed to apply operations: ${errorMessage}`),
        );
        syncOp.failed(channelError);
        remote.channel.deadLetter.add(syncOp);
      } else {
        syncOp.executed();
      }

      remote.channel.inbox.remove(syncOp);
    }
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

  private async getPersistedOutboxCursor(remoteName: string): Promise<number> {
    const cursor = await this.cursorStorage.get(remoteName, "outbox");
    return cursor.cursorOrdinal;
  }

  private getOutboxTailOrdinal(remote: Remote): number {
    const outboxItems = remote.channel.outbox.items;

    let maxOrdinal = 0;
    for (const syncOp of outboxItems) {
      maxOrdinal = Math.max(maxOrdinal, this.getMaxOrdinal(syncOp.operations));
    }
    return maxOrdinal;
  }

  private async getOutboxCheckpoint(remote: Remote): Promise<number> {
    const persisted = await this.getPersistedOutboxCursor(remote.name);
    const outboxTail = this.getOutboxTailOrdinal(remote);
    return Math.max(persisted, outboxTail);
  }

  private async setOutboxCheckpoint(
    remoteName: string,
    cursorOrdinal: number,
  ): Promise<void> {
    await this.cursorStorage.upsert({
      remoteName,
      cursorType: "outbox",
      cursorOrdinal,
      lastSyncedAtUtcMs: Date.now(),
    });
  }

  private getMaxOrdinal(operations: OperationWithContext[]): number {
    return operations.reduce(
      (maxOrdinal, operation) =>
        Math.max(maxOrdinal, operation.context.ordinal),
      0,
    );
  }

  private mergeCollectionMemberships(
    events: JobWriteReadyEvent[],
  ): Record<string, string[]> {
    const mergedMemberships: Record<string, string[]> = {};

    for (const event of events) {
      if (event.collectionMemberships) {
        for (const [docId, collections] of Object.entries(
          event.collectionMemberships,
        )) {
          if (!(docId in mergedMemberships)) {
            mergedMemberships[docId] = [];
          }
          for (const c of collections) {
            if (!mergedMemberships[docId].includes(c)) {
              mergedMemberships[docId].push(c);
            }
          }
        }
      }

      for (const op of event.operations) {
        const action = op.operation.action as {
          type: string;
          input?: { sourceId?: string; targetId?: string };
        };
        if (action.type !== "ADD_RELATIONSHIP") {
          continue;
        }
        const input = action.input;
        if (!input?.sourceId || !input.targetId) {
          continue;
        }

        const collectionId = driveCollectionId(
          op.context.branch,
          input.sourceId,
        );
        if (!(input.targetId in mergedMemberships)) {
          mergedMemberships[input.targetId] = [];
        }
        if (!mergedMemberships[input.targetId].includes(collectionId)) {
          mergedMemberships[input.targetId].push(collectionId);
        }
      }
    }

    return mergedMemberships;
  }

  private getAffectedRemotes(
    event: JobWriteReadyEvent,
    mergedMemberships: Record<string, string[]>,
    sourceRemote?: string,
  ): Array<{ remote: Remote; filteredOperations: OperationWithContext[] }> {
    const affected: Array<{
      remote: Remote;
      filteredOperations: OperationWithContext[];
    }> = [];

    for (const remote of this.remotes.values()) {
      if (sourceRemote && remote.name === sourceRemote) {
        continue;
      }

      let filteredOps = filterOperations(event.operations, remote.filter);
      if (filteredOps.length === 0) {
        continue;
      }

      if (remote.filter.documentId.length === 0) {
        filteredOps = this.filterByCollectionMembership(
          filteredOps,
          remote.collectionId,
          mergedMemberships,
        );
        if (filteredOps.length === 0) {
          continue;
        }
      }

      affected.push({ remote, filteredOperations: filteredOps });
    }

    return affected;
  }

  private async buildSyncOpsFromIndex(
    remote: Remote,
    jobId: string,
    jobDependencies: string[],
    options: IndexSyncBuildOptions = {},
  ): Promise<SyncOperation[]> {
    const checkpoint = await this.getOutboxCheckpoint(remote);
    let operations = await this.findRemoteOperationsSince(
      remote,
      checkpoint,
      options,
    );

    if (operations.length === 0 && options.fallbackOperations) {
      operations = options.fallbackOperations.filter((op) => {
        if (op.context.ordinal <= checkpoint) {
          return false;
        }

        if (
          options.sinceTimestampUtcMs &&
          op.operation.timestampUtcMs <= options.sinceTimestampUtcMs
        ) {
          return false;
        }

        if (
          options.maxOrdinal !== undefined &&
          op.context.ordinal > options.maxOrdinal
        ) {
          return false;
        }

        return true;
      });
    }

    if (operations.length === 0) {
      return [];
    }

    operations.sort((a, b) => a.context.ordinal - b.context.ordinal);
    const batches = batchOperationsByDocument(operations);

    return batches.map(
      (batch) =>
        new SyncOperation(
          crypto.randomUUID(),
          jobId,
          [...jobDependencies],
          remote.name,
          batch.documentId,
          [batch.scope],
          batch.branch,
          batch.operations,
        ),
    );
  }

  private async findRemoteOperationsSince(
    remote: Remote,
    checkpointOrdinal: number,
    options: IndexSyncBuildOptions,
  ): Promise<OperationWithContext[]> {
    const operations: OperationWithContext[] = [];
    let page = await this.operationIndex.find(
      remote.collectionId,
      checkpointOrdinal,
      undefined,
      {
        cursor: "0",
        limit: INDEX_PAGE_LIMIT,
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const pageOperations = filterOperations(
        page.results.map((entry) => this.toOperationWithContext(entry)),
        remote.filter,
      ).filter((op) => {
        if (op.context.ordinal <= checkpointOrdinal) {
          return false;
        }

        if (
          options.sinceTimestampUtcMs &&
          op.operation.timestampUtcMs <= options.sinceTimestampUtcMs
        ) {
          return false;
        }

        if (
          options.maxOrdinal !== undefined &&
          op.context.ordinal > options.maxOrdinal
        ) {
          return false;
        }

        return true;
      });

      operations.push(...pageOperations);

      if (!page.next) {
        break;
      }

      page = await page.next();
    }

    return operations;
  }

  private toOperationWithContext(
    entry: OperationIndexEntry,
  ): OperationWithContext {
    return {
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
    };
  }
}
