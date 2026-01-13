import type { Operation } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import {
  OperationEventTypes,
  type OperationWrittenEvent,
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
import { ChannelError } from "./errors.js";
import type { IChannelFactory, ISyncManager, Remote } from "./interfaces.js";
import { SyncOperation } from "./sync-operation.js";
import type {
  ChannelConfig,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteStatus,
} from "./types.js";
import { ChannelErrorSource, SyncOperationStatus } from "./types.js";
import {
  batchOperationsByDocument,
  createIdleHealth,
  filterOperations,
} from "./utils.js";

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

    this.eventUnsubscribe = this.eventBus.subscribe<OperationWrittenEvent>(
      OperationEventTypes.OPERATION_WRITTEN,
      (_type, event) => this.handleOperationWritten(event),
    );
  }

  shutdown(): ShutdownStatus {
    this.isShutdown = true;

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = undefined;
    }

    this.awaiter.shutdown();

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
    options: RemoteOptions = {},
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

    await this.backfillOutbox(remote, collectionId, filter);

    return remote;
  }

  private async backfillOutbox(
    remote: Remote,
    collectionId: string,
    filter: RemoteFilter,
  ): Promise<void> {
    let historicalOps;
    try {
      historicalOps = await this._operationIndex.find(collectionId);
    } catch {
      return;
    }

    if (historicalOps.items.length === 0) {
      return;
    }

    const opsWithContext = historicalOps.items.map((entry) => ({
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

    const filteredOps = filterOperations(opsWithContext, filter);
    if (filteredOps.length === 0) {
      return;
    }

    const batches = batchOperationsByDocument(filteredOps);

    for (const batch of batches) {
      const syncOp = new SyncOperation(
        crypto.randomUUID(),
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

  private wireChannelCallbacks(remote: Remote): void {
    remote.channel.inbox.onAdded((syncOp) => {
      this.handleInboxJob(remote, syncOp);
    });

    remote.channel.outbox.onAdded((syncOp) => {
      this.handleOutboxJob(remote, syncOp);
    });
  }

  private handleOperationWritten(event: OperationWrittenEvent): void {
    if (this.isShutdown) {
      return;
    }

    const sourceRemote = event.jobMeta?.sourceRemote as string | undefined;

    for (const remote of this.remotes.values()) {
      if (sourceRemote && remote.name === sourceRemote) {
        continue;
      }

      const filteredOps = filterOperations(event.operations, remote.filter);
      if (filteredOps.length === 0) {
        continue;
      }

      const batches = batchOperationsByDocument(filteredOps);

      for (const batch of batches) {
        const syncOp = new SyncOperation(
          crypto.randomUUID(),
          remote.name,
          batch.documentId,
          [batch.scope],
          batch.branch,
          batch.operations,
        );
        remote.channel.outbox.add(syncOp);
      }
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
}
