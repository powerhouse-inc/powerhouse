import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor, SyncModule } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import type { ILogger } from "../logging/types.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import { KyselySyncCursorStorage } from "../storage/kysely/sync-cursor-storage.js";
import { KyselySyncDeadLetterStorage } from "../storage/kysely/sync-dead-letter-storage.js";
import { KyselySyncRemoteStorage } from "../storage/kysely/sync-remote-storage.js";
import type { Database } from "../storage/kysely/types.js";
import type { IChannelFactory, ISyncManager } from "./interfaces.js";
import { SyncManager } from "./sync-manager.js";

export class SyncBuilder {
  private channelFactory?: IChannelFactory;
  private remoteStorage?: ISyncRemoteStorage;
  private cursorStorage?: ISyncCursorStorage;
  private deadLetterStorage?: ISyncDeadLetterStorage;
  private maxDeadLettersPerRemote: number = 100;

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

  withMaxDeadLettersPerRemote(limit: number): this {
    this.maxDeadLettersPerRemote = limit;
    return this;
  }

  build(
    reactor: IReactor,
    logger: ILogger,
    operationIndex: IOperationIndex,
    eventBus: IEventBus,
    db: Kysely<Database>,
  ): ISyncManager {
    const module = this.buildModule(
      reactor,
      logger,
      operationIndex,
      eventBus,
      db,
    );
    return module.syncManager;
  }

  buildModule(
    reactor: IReactor,
    logger: ILogger,
    operationIndex: IOperationIndex,
    eventBus: IEventBus,
    db: Kysely<Database>,
  ): SyncModule {
    if (!this.channelFactory) {
      throw new Error("Channel factory is required");
    }

    const remoteStorage = this.remoteStorage ?? new KyselySyncRemoteStorage(db);
    const cursorStorage = this.cursorStorage ?? new KyselySyncCursorStorage(db);
    const deadLetterStorage =
      this.deadLetterStorage ?? new KyselySyncDeadLetterStorage(db);

    const syncManager = new SyncManager(
      logger,
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      this.channelFactory,
      operationIndex,
      reactor,
      eventBus,
      this.maxDeadLettersPerRemote,
    );

    return {
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      channelFactory: this.channelFactory,
      syncManager,
    };
  }
}
