import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor, InProcessSyncModule } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncHoldStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import { KyselySyncCursorStorage } from "../storage/kysely/sync-cursor-storage.js";
import { KyselySyncDeadLetterStorage } from "../storage/kysely/sync-dead-letter-storage.js";
import { KyselySyncHoldStorage } from "../storage/kysely/sync-hold-storage.js";
import { KyselySyncRemoteStorage } from "../storage/kysely/sync-remote-storage.js";
import type { Database } from "../storage/kysely/types.js";
import type { IChannelFactory, ISyncManager } from "./interfaces.js";
import type { LocalPeer } from "./types.js";
import { SyncManager, type SyncManagerConfig } from "./sync-manager.js";

export class SyncBuilder {
  private channelFactory?: IChannelFactory;
  private remoteStorage?: ISyncRemoteStorage;
  private cursorStorage?: ISyncCursorStorage;
  private deadLetterStorage?: ISyncDeadLetterStorage;
  private holdStorage?: ISyncHoldStorage;
  private config: Partial<SyncManagerConfig> = {};

  withChannelFactory(factory: IChannelFactory): this {
    this.channelFactory = factory;
    return this;
  }

  withRemoteStorage(storage: ISyncRemoteStorage): this {
    this.remoteStorage = storage;
    return this;
  }

  withCursorStorage(storage: ISyncCursorStorage): this {
    this.cursorStorage = storage;
    return this;
  }

  withDeadLetterStorage(storage: ISyncDeadLetterStorage): this {
    this.deadLetterStorage = storage;
    return this;
  }

  withHoldStorage(storage: ISyncHoldStorage): this {
    this.holdStorage = storage;
    return this;
  }

  withMaxDeadLettersPerRemote(limit: number): this {
    this.config.maxDeadLettersPerRemote = limit;
    return this;
  }

  withMaxInboxBatchSize(limit: number): this {
    this.config.maxInboxBatchSize = limit;
    return this;
  }

  withMaxHeldOperationsPerRemote(limit: number): this {
    this.config.maxHeldOperationsPerRemote = limit;
    return this;
  }

  withStaleRemotePollWindowMs(windowMs: number): this {
    this.config.staleRemotePollWindowMs = windowMs;
    return this;
  }

  build(
    reactor: IReactor,
    logger: ILogger,
    operationIndex: IOperationIndex,
    eventBus: IEventBus,
    db: Kysely<Database>,
    driveContainerTypes: ReadonlySet<string>,
    localPeer?: LocalPeer,
  ): ISyncManager {
    const module = this.buildModule(
      reactor,
      logger,
      operationIndex,
      eventBus,
      db,
      driveContainerTypes,
      localPeer,
    );
    return module.syncManager;
  }

  buildModule(
    reactor: IReactor,
    logger: ILogger,
    operationIndex: IOperationIndex,
    eventBus: IEventBus,
    db: Kysely<Database>,
    driveContainerTypes: ReadonlySet<string>,
    localPeer?: LocalPeer,
  ): InProcessSyncModule {
    if (!this.channelFactory) {
      throw new Error("Channel factory is required");
    }

    const remoteStorage = this.remoteStorage ?? new KyselySyncRemoteStorage(db);
    const cursorStorage = this.cursorStorage ?? new KyselySyncCursorStorage(db);
    const deadLetterStorage =
      this.deadLetterStorage ?? new KyselySyncDeadLetterStorage(db);
    const holdStorage = this.holdStorage ?? new KyselySyncHoldStorage(db);

    const syncManager = new SyncManager(
      logger,
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      this.channelFactory,
      operationIndex,
      reactor,
      eventBus,
      driveContainerTypes,
      this.config,
      localPeer,
      holdStorage,
    );

    return {
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      holdStorage,
      channelFactory: this.channelFactory,
      syncManager,
    };
  }
}
