import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IReactor, SyncModule } from "../core/types.js";
import type { IEventBus } from "../events/interfaces.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
} from "../storage/interfaces.js";
import type { Database } from "../storage/kysely/types.js";
import { KyselySyncCursorStorage } from "../storage/kysely/sync-cursor-storage.js";
import { KyselySyncRemoteStorage } from "../storage/kysely/sync-remote-storage.js";
import type { IChannelFactory, ISyncManager } from "./interfaces.js";
import { SyncManager } from "./sync-manager.js";

export class SyncBuilder {
  private channelFactory?: IChannelFactory;
  private remoteStorage?: ISyncRemoteStorage;
  private cursorStorage?: ISyncCursorStorage;

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

  build(
    reactor: IReactor,
    operationIndex: IOperationIndex,
    eventBus: IEventBus,
    db: Kysely<Database>,
  ): ISyncManager {
    const module = this.buildModule(reactor, operationIndex, eventBus, db);
    return module.syncManager;
  }

  buildModule(
    reactor: IReactor,
    operationIndex: IOperationIndex,
    eventBus: IEventBus,
    db: Kysely<Database>,
  ): SyncModule {
    if (!this.channelFactory) {
      throw new Error("Channel factory is required");
    }

    const remoteStorage = this.remoteStorage ?? new KyselySyncRemoteStorage(db);
    const cursorStorage = this.cursorStorage ?? new KyselySyncCursorStorage(db);

    const syncManager = new SyncManager(
      remoteStorage,
      cursorStorage,
      this.channelFactory,
      operationIndex,
      reactor,
      eventBus,
    );

    return {
      remoteStorage,
      cursorStorage,
      channelFactory: this.channelFactory,
      syncManager,
    };
  }
}
