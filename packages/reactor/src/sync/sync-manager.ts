import type { Operation } from "document-model";
import type { OperationWithContext } from "shared/document-model";
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
  ISyncCursorStorage,
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
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteStatus,
  SyncResult,
} from "./types.js";
import { ChannelErrorSource } from "./types.js";
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
  private readonly channelFactory: IChannelFactory;
  private readonly operationIndex: IOperationIndex;
  private readonly reactor: IReactor;
  private readonly eventBus: IEventBus;
  private readonly remotes: Map<string, Remote>;
  private readonly awaiter: JobAwaiter;
  private readonly syncAwaiter: SyncAwaiter;
  private isShutdown: boolean;
  private eventUnsubscribe?: () => void;
  private failedEventUnsubscribe?: () => void;
  private readonly batchAggregator: BatchAggregator;
  private readonly syncStatusTracker: SyncStatusTracker;

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
      }
    });
  }

  private getRemotesForCollection(collectionId: string): Remote[] {
    return Array.from(this.remotes.values()).filter(
      (remote) => remote.collectionId === collectionId,
    );
  }

  private async processCompleteBatch(batch: PreparedBatch): Promise<void> {
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
      dependsOn: syncOp.jobDependencies.filter(Boolean),
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

  private async updateOutbox(
    remote: Remote,
    ackOrdinal: number,
  ): Promise<void> {
    const operations = await this.getOperationsForRemote(remote, ackOrdinal);
    if (operations.length === 0) {
      return;
    }

    // create sync operations, each batch has a dependency on the previous one
    const batches = batchOperationsByDocument(operations);

    let prevJobId: string | undefined;
    const syncOps: SyncOperation[] = [];
    for (const batch of batches) {
      const jobId = crypto.randomUUID();
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

      prevJobId = jobId;
    }

    remote.channel.outbox.add(...syncOps);
  }

  private async getOperationsForRemote(
    remote: Remote,
    ackOrdinal: number,
  ): Promise<OperationWithContext[]> {
    const results = await this.operationIndex.find(
      remote.collectionId,
      ackOrdinal,
      { excludeSourceRemote: remote.name },
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
