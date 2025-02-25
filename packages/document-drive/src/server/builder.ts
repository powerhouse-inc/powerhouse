import InMemoryCache from "#cache/memory";
import { ICache } from "#cache/types";
import { BaseQueueManager } from "#queue/base";
import { IQueueManager } from "#queue/types";
import { MemoryStorage } from "#storage/memory";
import { IDriveStorage } from "#storage/types";
import { DocumentModelModule } from "document-model";
import { DocumentDriveServer, TransmitterFactory } from "./base.js";
import { DefaultEventEmitter } from "./event-emitter.js";
import { ListenerManager } from "./listener/listener-manager.js";
import SynchronizationManager from "./sync-manager.js";
import {
  DefaultListenerManagerOptions,
  DocumentDriveServerOptions,
  IEventEmitter,
  IListenerManager,
  ISynchronizationManager,
  ITransmitterFactory,
} from "./types.js";

/**
 * Builder class for constructing Reactor instances with proper configuration
 */
export class ReactorBuilder {
  private documentModelModules: DocumentModelModule[] = [];

  private storage?: IDriveStorage;
  private cache?: ICache;
  private queueManager?: IQueueManager;
  private eventEmitter?: IEventEmitter;
  private options?: DocumentDriveServerOptions;
  private synchronizationManager?: ISynchronizationManager;
  private listenerManager?: IListenerManager;
  private transmitterFactory?: ITransmitterFactory;

  constructor(documentModelModules: DocumentModelModule[]) {
    this.documentModelModules = documentModelModules;
  }

  public withStorage(storage: IDriveStorage): this {
    this.storage = storage;
    return this;
  }

  public withCache(cache: ICache): this {
    this.cache = cache;
    return this;
  }

  public withQueueManager(queueManager: IQueueManager): this {
    this.queueManager = queueManager;
    return this;
  }

  public withEventEmitter(eventEmitter: IEventEmitter): this {
    this.eventEmitter = eventEmitter;
    return this;
  }

  public withSynchronizationManager(
    synchronizationManager: ISynchronizationManager,
  ): this {
    this.synchronizationManager = synchronizationManager;
    return this;
  }

  public withListenerManager(listenerManager: IListenerManager): this {
    this.listenerManager = listenerManager;
    return this;
  }

  public withTransmitterFactory(transmitterFactory: ITransmitterFactory): this {
    this.transmitterFactory = transmitterFactory;
    return this;
  }

  public withOptions(options: DocumentDriveServerOptions): this {
    this.options = options;
    return this;
  }

  public build() {
    if (!this.documentModelModules.length) {
      throw new Error("Document models are required to build the server");
    }

    if (!this.storage) {
      this.storage = new MemoryStorage();
    }

    if (!this.cache) {
      this.cache = new InMemoryCache();
    }

    if (!this.queueManager) {
      this.queueManager = new BaseQueueManager();
    }

    if (!this.eventEmitter) {
      this.eventEmitter = new DefaultEventEmitter();
    }

    if (!this.synchronizationManager) {
      this.synchronizationManager = new SynchronizationManager(
        this.storage,
        this.cache,
        this.documentModelModules,
        this.eventEmitter,
      );
    }

    if (!this.listenerManager) {
      const config = {
        ...DefaultListenerManagerOptions,
        ...this.options?.listenerManager,
      };

      this.listenerManager = new ListenerManager(
        this.synchronizationManager,
        config,
      );
    }

    if (!this.transmitterFactory) {
      this.transmitterFactory = new TransmitterFactory(this.listenerManager);
    }

    return new DocumentDriveServer(
      this.documentModelModules,
      this.storage,
      this.cache,
      this.queueManager,
      this.eventEmitter,
      this.synchronizationManager,
      this.listenerManager,
      this.transmitterFactory,
      this.options,
    );
  }
}
