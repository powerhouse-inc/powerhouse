import { type DocumentModelModule } from "document-model";
import InMemoryCache from "../cache/memory.js";
import { type ICache } from "../cache/types.js";
import { BaseQueueManager } from "../queue/base.js";
import { type IQueueManager } from "../queue/types.js";
import { MemoryStorage } from "../storage/memory.js";
import { type IDocumentStorage, type IDriveStorage } from "../storage/types.js";
import { DocumentDriveServer } from "./base-server.js";
import { DefaultEventEmitter } from "./event-emitter.js";
import { ListenerManager } from "./listener/listener-manager.js";
import TransmitterFactory from "./listener/transmitter/factory.js";
import SynchronizationManager from "./sync-manager.js";
import {
  DefaultListenerManagerOptions,
  type DocumentDriveServerOptions,
  type IDocumentDriveServer,
  type IEventEmitter,
  type IListenerManager,
  type ISynchronizationManager,
  type ITransmitterFactory,
} from "./types.js";

/**
 * Builder class for constructing Reactor instances with proper configuration
 */
export class ReactorBuilder {
  public documentModelModules: DocumentModelModule[] = [];

  public storage?: IDriveStorage;
  public cache?: ICache;
  public queueManager?: IQueueManager;
  public eventEmitter?: IEventEmitter;
  public options?: DocumentDriveServerOptions;
  public synchronizationManager?: ISynchronizationManager;
  public listenerManager?: IListenerManager;
  public transmitterFactory?: ITransmitterFactory;

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

  public build(): IDocumentDriveServer {
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
        // as we refactor, we're secretly making all the IStorage implementations also implement IDocumentStorage
        this.storage as unknown as IDocumentStorage,
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
      // as we refactor, we're secretly making all the IStorage implementations also implement IDocumentStorage
      this.storage as unknown as IDocumentStorage,
      this.cache,
      this.queueManager,
      this.eventEmitter,
      this.synchronizationManager,
      this.listenerManager,
      this.options,
    );
  }
}
