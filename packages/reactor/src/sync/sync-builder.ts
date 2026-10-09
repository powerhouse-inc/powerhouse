import type { ISettledWatermark } from "../catch-up/types.js";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor, InProcessSyncModule } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncHoldStorage,
  ISyncPurgeRefusalStorage,
  ISyncReceivedMarkerStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import { FlushGuardedSyncCursorStorage } from "../storage/flush-guarded-sync-cursor-storage.js";
import { deliveryAt } from "../storage/kysely/delivery-lookup.js";
import { listPurged } from "../storage/kysely/document-purges.js";
import { KyselySyncCursorStorage } from "../storage/kysely/sync-cursor-storage.js";
import { KyselySyncDeadLetterStorage } from "../storage/kysely/sync-dead-letter-storage.js";
import { KyselySyncHoldStorage } from "../storage/kysely/sync-hold-storage.js";
import { KyselySyncPurgeRefusalStorage } from "../storage/kysely/sync-purge-refusal-storage.js";
import { KyselySyncReceivedMarkerStorage } from "../storage/kysely/sync-received-marker-storage.js";
import { KyselySyncRemoteStorage } from "../storage/kysely/sync-remote-storage.js";
import type { Database } from "../storage/kysely/types.js";
import type { IStorageFlusher } from "../storage/storage-flush.js";
import { NoopStorageFlusher } from "../storage/storage-flush.js";
import type { IChannelFactory, ISyncManager } from "./interfaces.js";
import type { LocalPeer } from "./types.js";
import { SyncManager, type SyncManagerConfig } from "./sync-manager.js";

export class SyncBuilder {
  private channelFactory?: IChannelFactory;
  private remoteStorage?: ISyncRemoteStorage;
  private cursorStorage?: ISyncCursorStorage;
  private deadLetterStorage?: ISyncDeadLetterStorage;
  private holdStorage?: ISyncHoldStorage;
  private receivedMarkerStorage?: ISyncReceivedMarkerStorage;
  private purgeRefusalStorage?: ISyncPurgeRefusalStorage;
  private storageFlusher: IStorageFlusher = new NoopStorageFlusher();
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

  /** The barrier every cursor write, including a custom storage's, goes behind. */
  withStorageFlusher(flusher: IStorageFlusher): this {
    this.storageFlusher = flusher;
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

  withReceivedMarkerStorage(storage: ISyncReceivedMarkerStorage): this {
    this.receivedMarkerStorage = storage;
    return this;
  }

  withPurgeRefusalStorage(storage: ISyncPurgeRefusalStorage): this {
    this.purgeRefusalStorage = storage;
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
    watermark: ISettledWatermark,
    localPeer?: LocalPeer,
  ): ISyncManager {
    const module = this.buildModule(
      reactor,
      logger,
      operationIndex,
      eventBus,
      db,
      driveContainerTypes,
      watermark,
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
    watermark: ISettledWatermark,
    localPeer?: LocalPeer,
  ): InProcessSyncModule {
    if (!this.channelFactory) {
      throw new Error("Channel factory is required");
    }

    const remoteStorage = this.remoteStorage ?? new KyselySyncRemoteStorage(db);
    const cursorStorage = new FlushGuardedSyncCursorStorage(
      this.cursorStorage ?? new KyselySyncCursorStorage(db),
      this.storageFlusher,
    );
    const deadLetterStorage =
      this.deadLetterStorage ?? new KyselySyncDeadLetterStorage(db);
    const holdStorage = this.holdStorage ?? new KyselySyncHoldStorage(db);
    const receivedMarkerStorage =
      this.receivedMarkerStorage ?? new KyselySyncReceivedMarkerStorage(db);
    const purgeRefusalStorage =
      this.purgeRefusalStorage ?? new KyselySyncPurgeRefusalStorage(db);

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
      watermark,
      this.config,
      localPeer,
      holdStorage,
      { listPurged: () => listPurged(db) },
      receivedMarkerStorage,
      { at: (documentId, ordinal) => deliveryAt(db, documentId, ordinal) },
      purgeRefusalStorage,
    );

    return {
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      holdStorage,
      channelFactory: this.channelFactory,
      syncManager,
      syncAdmin: syncManager,
    };
  }
}
