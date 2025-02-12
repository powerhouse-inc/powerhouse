import { DocumentModel } from "document-model/document";
import { ICache } from "../cache";
import InMemoryCache from "../cache/memory";
import { BaseQueueManager } from "../queue/base";
import { IQueueManager } from "../queue/types";
import { MemoryStorage } from "../storage/memory";
import { IDriveStorage } from "../storage/types";
import { DocumentDriveServer } from "./base-server";
import { DefaultEventEmitter } from "./event-emitter";
import { ListenerManager } from "./listener/listener-manager";
import TransmitterFactory from "./listener/transmitter/factory";
import SynchronizationManager from "./sync-manager";
import {
  DefaultListenerManagerOptions,
  type DocumentDriveServerOptions,
  type IEventEmitter,
  type IListenerManager,
  type ISynchronizationManager,
  type ITransmitterFactory,
} from "./types";

/**
 * Builder class for constructing BaseDocumentDriveServer instances with proper configuration
 */
export class DocumentDriveServerBuilder {
  private documentModels: DocumentModel[] = [];

  private storage?: IDriveStorage;
  private cache?: ICache;
  private queueManager?: IQueueManager;
  private eventEmitter?: IEventEmitter;
  private options?: DocumentDriveServerOptions;
  private synchronizationManager?: ISynchronizationManager;
  private listenerManager?: IListenerManager;
  private transmitterFactory?: ITransmitterFactory;

  constructor(models: DocumentModel[]) {
    this.documentModels = models;
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
    if (!this.documentModels.length) {
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
        this.documentModels,
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
      this.documentModels,
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
