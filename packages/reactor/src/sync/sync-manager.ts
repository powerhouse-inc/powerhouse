import type { Operation } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import {
  OperationEventTypes,
  type OperationWrittenEvent,
} from "../events/types.js";
import { JobStatus, type ShutdownStatus } from "../shared/types.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import { ChannelError } from "./errors.js";
import type { IChannelFactory, ISyncManager, Remote } from "./interfaces.js";
import { JobHandle } from "./job-handle.js";
import type {
  ChannelConfig,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteStatus,
} from "./types.js";
import { ChannelErrorSource, JobChannelStatus } from "./types.js";
import { createIdleHealth, filterOperations } from "./utils.js";

export class SyncManager implements ISyncManager {
  private readonly remoteStorage: ISyncRemoteStorage;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly channelFactory: IChannelFactory;
  private readonly _operationIndex: IOperationIndex;
  private readonly reactor: IReactor;
  private readonly eventBus: IEventBus;
  private readonly remotes: Map<string, Remote>;
  private isShutdown: boolean;
  private eventUnsubscribe?: () => void;

  constructor(
    remoteStorage: ISyncRemoteStorage,
    cursorStorage: ISyncCursorStorage,
    channelFactory: IChannelFactory,
    operationIndex: IOperationIndex,
    reactor: IReactor,
    eventBus: IEventBus,
  ) {
    this.remoteStorage = remoteStorage;
    this.cursorStorage = cursorStorage;
    this.channelFactory = channelFactory;
    this._operationIndex = operationIndex;
    this.reactor = reactor;
    this.eventBus = eventBus;
    this.remotes = new Map();
    this.isShutdown = false;
  }

  async startup(): Promise<void> {
    if (this.isShutdown) {
      throw new Error("SyncManager is already shutdown and cannot be started");
    }

    const remoteRecords = await this.remoteStorage.list();

    for (const record of remoteRecords) {
      const channel = this.channelFactory.instance(
        record.channelConfig,
        this.cursorStorage,
      );
      const remote: Remote = {
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

  get(name: string): Remote {
    const remote = this.remotes.get(name);
    if (!remote) {
      throw new Error(`Remote with name '${name}' does not exist`);
    }
    return remote;
  }

  async add(
    name: string,
    collectionId: string,
    channelConfig: ChannelConfig,
    filter: RemoteFilter = { documentId: [], scope: [], branch: "" },
    options: RemoteOptions = {},
  ): Promise<Remote> {
    if (this.isShutdown) {
      throw new Error("SyncManager is shutdown and cannot add remotes");
    }

    if (this.remotes.has(name)) {
      throw new Error(`Remote with name '${name}' already exists`);
    }

    const status: RemoteStatus = {
      push: createIdleHealth(),
      pull: createIdleHealth(),
    };

    const remoteRecord: RemoteRecord = {
      name,
      collectionId,
      channelConfig,
      filter,
      options,
      status,
    };

    await this.remoteStorage.upsert(remoteRecord);

    const channel = this.channelFactory.instance(
      channelConfig,
      this.cursorStorage,
    );
    const remote: Remote = {
      name,
      collectionId,
      filter,
      options,
      channel,
    };

    this.remotes.set(name, remote);
    this.wireChannelCallbacks(remote);

    return remote;
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
    remote.channel.inbox.onAdded((job) => {
      this.handleInboxJob(remote, job);
    });

    remote.channel.outbox.onAdded((job) => {
      this.handleOutboxJob(remote, job);
    });
  }

  private handleOperationWritten(event: OperationWrittenEvent): void {
    if (this.isShutdown) {
      return;
    }

    for (const remote of this.remotes.values()) {
      const filteredOps = filterOperations(event.operations, remote.filter);
      if (filteredOps.length === 0) {
        continue;
      }

      const job = new JobHandle(
        crypto.randomUUID(),
        remote.name,
        filteredOps[0].context.documentId,
        [...new Set(filteredOps.map((op) => op.context.scope))],
        filteredOps[0].context.branch,
        filteredOps,
      );

      remote.channel.outbox.add(job);
    }
  }

  private handleInboxJob(remote: Remote, job: JobHandle): void {
    if (this.isShutdown) {
      return;
    }

    void this.applyInboxJob(remote, job);
  }

  private handleOutboxJob(remote: Remote, job: JobHandle): void {
    job.on((job, _prev, next) => {
      if (next === JobChannelStatus.Applied) {
        remote.channel.outbox.remove(job);
      } else if (next === JobChannelStatus.Error) {
        remote.channel.outbox.remove(job);
      }
    });
  }

  private async applyInboxJob(remote: Remote, job: JobHandle): Promise<void> {
    const operations: Operation[] = job.operations.map((op) => op.operation);

    let result;
    try {
      result = await this.reactor.load(job.documentId, job.branch, operations);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Inbox, err);
      job.failed(channelError);
      remote.channel.deadLetter.add(job);
      remote.channel.inbox.remove(job);
      return;
    }

    if (result.status === JobStatus.FAILED) {
      const error = new ChannelError(
        ChannelErrorSource.Inbox,
        new Error(
          `Failed to apply operations: ${result.error?.message || "Unknown error"}`,
        ),
      );
      job.failed(error);
      remote.channel.deadLetter.add(job);
    } else {
      job.executed();
    }

    remote.channel.inbox.remove(job);
  }
}
