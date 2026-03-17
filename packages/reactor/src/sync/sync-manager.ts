import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Operation } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
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
import {
  JobStatus,
  type JobInfo,
  type ShutdownStatus,
} from "../shared/types.js";
import type {
  DeadLetterRecord,
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import { BatchAggregator, type PreparedBatch } from "./batch-aggregator.js";
import { ChannelError } from "./errors.js";
import type { IChannelFactory, ISyncManager, Remote } from "./interfaces.js";
import { SyncAwaiter } from "./sync-awaiter.js";
import { SyncOperation } from "./sync-operation.js";
import {
  SyncStatusTracker,
  type SyncStatus,
  type SyncStatusChangeCallback,
} from "./sync-status-tracker.js";
import type {
  ChannelConfig,
  ConnectionStateChangedEvent,
  DeadLetterAddedEvent,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteStatus,
  SyncResult,
} from "./types.js";
import { ChannelErrorSource, SyncEventTypes } from "./types.js";
import {
  batchOperationsByDocument,
  createIdleHealth,
  filterOperations,
  toOperationWithContext,
  trimMailboxFromBatch,
} from "./utils.js";

export class SyncManager implements ISyncManager {
  private readonly logger: ILogger;
  private readonly remoteStorage: ISyncRemoteStorage;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly deadLetterStorage: ISyncDeadLetterStorage;
  private readonly channelFactory: IChannelFactory;
  private readonly operationIndex: IOperationIndex;
  private readonly reactor: IReactor;
  private readonly eventBus: IEventBus;
  private readonly remotes: Map<string, Remote>;
  private readonly awaiter: JobAwaiter;
  private readonly syncAwaiter: SyncAwaiter;
  private readonly abortController = new AbortController();
  private isShutdown: boolean;
  private eventUnsubscribe?: () => void;
  private failedEventUnsubscribe?: () => void;
  private readonly batchAggregator: BatchAggregator;
  private readonly syncStatusTracker: SyncStatusTracker;
  private readonly maxDeadLettersPerRemote: number;
  private readonly connectionStateUnsubscribes: Map<string, () => void> =
    new Map();
  private readonly quarantinedDocumentIds = new Set<string>();

  public loadJobs: Map<string, JobInfo> = new Map();

  constructor(
    logger: ILogger,
    remoteStorage: ISyncRemoteStorage,
    cursorStorage: ISyncCursorStorage,
    deadLetterStorage: ISyncDeadLetterStorage,
    channelFactory: IChannelFactory,
    operationIndex: IOperationIndex,
    reactor: IReactor,
    eventBus: IEventBus,
    maxDeadLettersPerRemote: number = 100,
  ) {
    this.logger = logger;
    this.remoteStorage = remoteStorage;
    this.cursorStorage = cursorStorage;
    this.deadLetterStorage = deadLetterStorage;
    this.channelFactory = channelFactory;
    this.operationIndex = operationIndex;
    this.reactor = reactor;
    this.eventBus = eventBus;
    this.maxDeadLettersPerRemote = maxDeadLettersPerRemote;
    this.remotes = new Map();
    this.awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
      reactor.getJobStatus(jobId, signal),
    );
    this.syncAwaiter = new SyncAwaiter(eventBus);
    this.isShutdown = false;
    this.batchAggregator = new BatchAggregator(logger, (batch) =>
      this.processCompleteBatch(batch),
    );
    this.syncStatusTracker = new SyncStatusTracker();
  }

  async startup(): Promise<void> {
    if (this.isShutdown) {
      throw new Error("SyncManager is already shutdown and cannot be started");
    }

    try {
      const quarantinedIds =
        await this.deadLetterStorage.listQuarantinedDocumentIds();
      for (const id of quarantinedIds) {
        this.quarantinedDocumentIds.add(id);
      }
    } catch (error) {
      this.logger.error(
        "Failed to load quarantined document IDs (@error)",
        error instanceof Error ? error.message : String(error),
      );
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

      const remote: Remote = {
        id: record.id,
        name: record.name,
        collectionId: record.collectionId,
        filter: record.filter,
        options: record.options,
        channel,
      };

      this.remotes.set(record.name, remote);
      await this.loadDeadLetters(remote);
      this.wireChannelCallbacks(remote);

      try {
        await channel.init();
      } catch (error) {
        this.logger.error(
          "Error initializing channel for remote (@name, @error)",
          record.name,
          error instanceof Error ? error.message : String(error),
        );
        this.remotes.delete(record.name);
        continue;
      }

      // backfill channels
      const outboxAckOrdinal = remote.channel.outbox.ackOrdinal;
      if (outboxAckOrdinal > 0) {
        await this.updateOutbox(remote, outboxAckOrdinal);
      }
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
    this.abortController.abort();
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
    this.syncStatusTracker.clear();

    for (const unsub of this.connectionStateUnsubscribes.values()) {
      unsub();
    }
    this.connectionStateUnsubscribes.clear();

    const promises: Promise<void>[] = [];
    for (const remote of this.remotes.values()) {
      promises.push(remote.channel.shutdown());
    }

    this.remotes.clear();

    return {
      isShutdown: true,
      completed: Promise.all(promises).then(() => undefined),
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

    const remote: Remote = {
      id: remoteId,
      name,
      collectionId,
      filter,
      options,
      channel,
    };

    this.remotes.set(name, remote);
    await this.loadDeadLetters(remote);
    this.wireChannelCallbacks(remote);

    try {
      await channel.init();
    } catch (error) {
      this.remotes.delete(name);
      await this.remoteStorage.remove(name);
      throw error;
    }

    // backfill
    await this.updateOutbox(remote, 0);

    return remote;
  }

  async remove(name: string): Promise<void> {
    const remote = this.remotes.get(name);
    if (!remote) {
      throw new Error(`Remote with name '${name}' does not exist`);
    }

    // shutdown the channel
    await remote.channel.shutdown();

    // delete the remote's data
    await this.remoteStorage.remove(name);
    await this.cursorStorage.remove(name);

    this.syncStatusTracker.untrackRemote(name);
    const unsub = this.connectionStateUnsubscribes.get(name);
    if (unsub) {
      unsub();
      this.connectionStateUnsubscribes.delete(name);
    }
    this.remotes.delete(name);
  }

  list(): Remote[] {
    return Array.from(this.remotes.values());
  }

  waitForSync(jobId: string, signal?: AbortSignal): Promise<SyncResult> {
    return this.syncAwaiter.waitForSync(jobId, signal);
  }

  getSyncStatus(documentId: string): SyncStatus | undefined {
    return this.syncStatusTracker.getStatus(documentId);
  }

  onSyncStatusChange(callback: SyncStatusChangeCallback): () => void {
    return this.syncStatusTracker.onChange(callback);
  }

  private wireChannelCallbacks(remote: Remote): void {
    remote.channel.inbox.onAdded((syncOps) =>
      this.handleInboxAdded(remote, syncOps),
    );

    this.syncStatusTracker.trackRemote(remote.name, remote.channel);

    const unsubscribe = remote.channel.onConnectionStateChange((snapshot) => {
      void this.eventBus
        .emit(SyncEventTypes.CONNECTION_STATE_CHANGED, {
          remoteName: remote.name,
          remoteId: remote.id,
          previous: snapshot.state,
          current: snapshot.state,
          snapshot,
        } satisfies ConnectionStateChangedEvent)
        .catch(() => {});
    });
    this.connectionStateUnsubscribes.set(remote.name, unsubscribe);

    remote.channel.deadLetter.onAdded((syncOps) => {
      for (const syncOp of syncOps) {
        this.logger.error(
          "Dead letter (@remote, @documentId, @jobId, @error, @dependencies)",
          remote.name,
          syncOp.documentId,
          syncOp.jobId,
          syncOp.error?.message ?? "unknown",
          syncOp.jobDependencies,
        );

        this.quarantinedDocumentIds.add(syncOp.documentId);

        const record: DeadLetterRecord = {
          id: syncOp.id,
          jobId: syncOp.jobId,
          jobDependencies: syncOp.jobDependencies,
          remoteName: syncOp.remoteName,
          documentId: syncOp.documentId,
          scopes: syncOp.scopes,
          branch: syncOp.branch,
          operations: syncOp.operations,
          errorSource: syncOp.error?.source ?? ChannelErrorSource.None,
          errorMessage: syncOp.error?.error.message ?? "unknown",
        };

        void this.deadLetterStorage.add(record).catch((err) => {
          this.logger.error(
            "Failed to persist dead letter (@id, @error)",
            record.id,
            err instanceof Error ? err.message : String(err),
          );
        });

        void this.eventBus
          .emit(SyncEventTypes.DEAD_LETTER_ADDED, {
            id: record.id,
            jobId: record.jobId,
            remoteName: record.remoteName,
            documentId: record.documentId,
            errorSource: record.errorSource,
          } satisfies DeadLetterAddedEvent)
          .catch(() => {});
      }

      // Evict oldest dead letters from mailbox if over capacity
      const items = remote.channel.deadLetter.items;
      if (items.length > this.maxDeadLettersPerRemote) {
        const excessCount = items.length - this.maxDeadLettersPerRemote;
        const toEvict = items.slice(0, excessCount);
        remote.channel.deadLetter.remove(...toEvict);
      }
    });
  }

  private async loadDeadLetters(remote: Remote): Promise<void> {
    let records: DeadLetterRecord[];
    try {
      const page = await this.deadLetterStorage.list(remote.name, {
        cursor: "0",
        limit: this.maxDeadLettersPerRemote,
      });
      records = page.results;
    } catch (error) {
      this.logger.error(
        "Failed to load dead letters for remote (@name, @error)",
        remote.name,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    if (records.length === 0) {
      return;
    }

    // Records come in ordinal DESC order (newest first).
    // Reverse so the Map maintains chronological insertion order (oldest first),
    // which makes eviction (slice from the front) straightforward.
    records.reverse();

    const syncOps: SyncOperation[] = [];
    for (const record of records) {
      const syncOp = new SyncOperation(
        record.id,
        record.jobId,
        record.jobDependencies,
        record.remoteName,
        record.documentId,
        record.scopes,
        record.branch,
        record.operations,
      );
      syncOp.failed(
        new ChannelError(record.errorSource, new Error(record.errorMessage)),
      );
      syncOps.push(syncOp);
    }

    remote.channel.deadLetter.add(...syncOps);

    this.logger.debug(
      "Loaded @count persisted dead letters for remote @name",
      records.length,
      remote.name,
    );
  }

  private getRemotesForCollection(collectionId: string): Remote[] {
    return Array.from(this.remotes.values()).filter(
      (remote) => remote.collectionId === collectionId,
    );
  }

  private async processCompleteBatch(batch: PreparedBatch): Promise<void> {
    if (this.isShutdown) return;

    // get the unique set of collection ids
    const collectionIds = [
      ...new Set(
        Object.values(batch.collectionMemberships).flatMap(
          (collections) => collections,
        ),
      ),
    ];

    // get the unique set of affected remotes
    const affectedRemotes: Remote[] = [];
    for (const collectionId of collectionIds) {
      const remotes = this.getRemotesForCollection(collectionId);
      for (const remote of remotes) {
        if (!affectedRemotes.includes(remote)) {
          affectedRemotes.push(remote);
        }
      }
    }

    // ack matching inbox items
    for (const remote of affectedRemotes) {
      trimMailboxFromBatch(remote.channel.inbox, batch);
    }

    // finally, work through the affected remotes and backfill based on the last operation in the outbox
    for (const remote of affectedRemotes) {
      await this.updateOutbox(remote, remote.channel.outbox.latestOrdinal);
    }
  }

  private handleInboxAdded(remote: Remote, syncOps: SyncOperation[]): void {
    if (this.isShutdown) {
      return;
    }

    const eligible = syncOps.filter(
      (op) => !this.quarantinedDocumentIds.has(op.documentId),
    );
    if (eligible.length === 0) return;

    const keyed: SyncOperation[] = [];
    const nonKeyed: SyncOperation[] = [];

    for (const syncOp of eligible) {
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
        this.abortController.signal,
        { sourceRemote: remote.name },
      );
    } catch (error) {
      if (this.isShutdown) return;
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
      completedJobInfo = await this.awaiter.waitForJob(
        jobInfo.id,
        this.abortController.signal,
      );
    } catch (error) {
      if (this.isShutdown) return;
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

    if (this.isShutdown) return;

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
      dependsOn: syncOp.jobDependencies.filter(Boolean),
    }));

    const request: BatchLoadRequest = { jobs };

    let result: BatchLoadResult;
    try {
      result = await this.reactor.loadBatch(
        request,
        this.abortController.signal,
        { sourceRemote },
      );
    } catch (error) {
      if (this.isShutdown) return;
      for (const { remote, syncOp } of items) {
        const err = error instanceof Error ? error : new Error(String(error));
        syncOp.failed(new ChannelError(ChannelErrorSource.Inbox, err));
        remote.channel.deadLetter.add(syncOp);
        remote.channel.inbox.remove(syncOp);
      }
      return;
    }

    if (this.isShutdown) return;

    for (const { remote, syncOp } of items) {
      if (!(syncOp.jobId in result.jobs)) {
        this.logger.error(
          "Job key missing from batch load result (@remote, @documentId, @jobId)",
          remote.name,
          syncOp.documentId,
          syncOp.jobId,
        );
        const error = new ChannelError(
          ChannelErrorSource.Inbox,
          new Error(`Job key '${syncOp.jobId}' missing from batch load result`),
        );
        syncOp.failed(error);
        remote.channel.deadLetter.add(syncOp);
        remote.channel.inbox.remove(syncOp);
        continue;
      }
      const jobInfo = result.jobs[syncOp.jobId];

      let completedJobInfo;
      try {
        completedJobInfo = await this.awaiter.waitForJob(
          jobInfo.id,
          this.abortController.signal,
        );
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- isShutdown may change during await
        if (this.isShutdown) continue;
        const err = error instanceof Error ? error : new Error(String(error));
        syncOp.failed(new ChannelError(ChannelErrorSource.Inbox, err));
        remote.channel.deadLetter.add(syncOp);
        remote.channel.inbox.remove(syncOp);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- isShutdown may change during await
      if (this.isShutdown) return;

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

  private async updateOutbox(
    remote: Remote,
    ackOrdinal: number,
  ): Promise<void> {
    const allOperations = await this.getOperationsForRemote(remote, ackOrdinal);
    const maxOrdinal = allOperations.reduce(
      (max, op) => Math.max(max, op.context.ordinal),
      ackOrdinal,
    );
    const operations = allOperations.filter(
      (op) => !this.quarantinedDocumentIds.has(op.context.documentId),
    );
    if (operations.length === 0) {
      remote.channel.outbox.advanceOrdinal(maxOrdinal);
      return;
    }

    // sort by (documentId, scope, ordinal) so batchOperationsByDocument
    // groups all operations for the same document together
    operations.sort((a, b) => {
      if (a.context.documentId !== b.context.documentId) {
        return a.context.documentId < b.context.documentId ? -1 : 1;
      }
      if (a.context.scope !== b.context.scope) {
        return a.context.scope < b.context.scope ? -1 : 1;
      }
      return a.context.ordinal - b.context.ordinal;
    });

    const batches = batchOperationsByDocument(operations);

    // per-document dependency chain: each batch depends on the previous
    // batch for the same documentId only, allowing independent documents
    // to be processed in parallel
    const lastJobByDoc = new Map<string, string>();
    const syncOps: SyncOperation[] = [];
    for (const batch of batches) {
      const jobId = crypto.randomUUID();
      const prevJobId = lastJobByDoc.get(batch.documentId);
      const syncOp = new SyncOperation(
        crypto.randomUUID(),
        jobId,
        prevJobId ? [prevJobId] : [],
        remote.name,
        batch.documentId,
        [batch.scope],
        batch.branch,
        batch.operations,
      );

      syncOps.push(syncOp);
      lastJobByDoc.set(batch.documentId, jobId);
    }

    remote.channel.outbox.add(...syncOps);
    remote.channel.outbox.advanceOrdinal(maxOrdinal);
  }

  private async getOperationsForRemote(
    remote: Remote,
    ackOrdinal: number,
  ): Promise<OperationWithContext[]> {
    const results = await this.operationIndex.find(
      remote.collectionId,
      ackOrdinal,
      { excludeSourceRemote: remote.name },
      undefined,
      this.abortController.signal,
    );

    let operations = results.results.map((entry) =>
      toOperationWithContext(entry),
    );

    // apply the sinceTimestampUtcMs filter
    const sinceTimestamp = remote.options.sinceTimestampUtcMs;
    if (sinceTimestamp && sinceTimestamp !== "0") {
      operations = operations.filter(
        (op) => op.operation.timestampUtcMs >= sinceTimestamp,
      );
    }

    // apply the remote filter
    return filterOperations(operations, remote.filter);
  }
}
