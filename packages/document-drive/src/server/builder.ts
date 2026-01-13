import type {
  DocumentDriveServerOptions,
  ICache,
  IDocumentDriveServer,
  IDocumentStorage,
  IDriveOperationStorage,
  IEventEmitter,
  IListenerManager,
  IQueueManager,
  ISynchronizationManager,
  ITransmitterFactory,
} from "document-drive";
import { InMemoryCache } from "document-drive/cache/memory";
import { EventQueueManager } from "document-drive/queue/event";
import { MemoryStorage } from "document-drive/storage/memory";
import type { DocumentModelModule } from "document-model";
import { DocumentDriveServer } from "./base-server.js";
import { DefaultEventEmitter } from "./event-emitter.js";
import { DefaultListenerManagerOptions } from "./listener/constants.js";
import { ListenerManager } from "./listener/listener-manager.js";
import { SynchronizationManager } from "./sync-manager.js";
import { TransmitterFactory } from "./transmitter/factory.js";

/**
 * Builder class for constructing Reactor instances with proper configuration
 */
export class ReactorBuilder {
  public documentModelModules: DocumentModelModule<any>[] = [];

  public storage?: IDriveOperationStorage;
  public cache?: ICache;
  public queueManager?: IQueueManager;
  public eventEmitter?: IEventEmitter;
  public options?: DocumentDriveServerOptions;
  public synchronizationManager?: ISynchronizationManager;
  public listenerManager?: IListenerManager;
  public transmitterFactory?: ITransmitterFactory;

  constructor(documentModelModules: DocumentModelModule<any>[]) {
    this.documentModelModules = documentModelModules;
  }

  public withStorage(storage: IDriveOperationStorage): this {
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
    if (!this.storage) {
      this.storage = new MemoryStorage();
    }

    if (!this.cache) {
      this.cache = new InMemoryCache();
    }

    if (!this.queueManager) {
      this.queueManager = new EventQueueManager();
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
      {
        ...this.options,
        featureFlags: {
          enableDualActionCreate: false, // default to false for safety
          ...this.options?.featureFlags,
        },
      },
    );
  }
}
