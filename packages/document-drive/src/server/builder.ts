import { DocumentModel } from "document-model/document";
import { ICache } from "../cache";
import InMemoryCache from "../cache/memory";
import { BaseQueueManager } from "../queue/base";
import { IQueueManager } from "../queue/types";
import { MemoryStorage } from "../storage/memory";
import { IDriveStorage } from "../storage/types";
import { BaseDocumentDriveServer } from "./base-server";
import { DefaultEventEmitter } from "./event-emitter";
import type { DocumentDriveServerOptions } from "./types";
import { IEventEmitter } from "./types";

/**
 * Builder class for constructing BaseDocumentDriveServer instances with proper configuration
 */
export class DocumentDriveServerBuilder {
  private documentModels: DocumentModel[] = [];
  private storage: IDriveStorage = new MemoryStorage();
  private cache: ICache = new InMemoryCache();
  private queueManager: IQueueManager = new BaseQueueManager();
  private eventEmitter: IEventEmitter = new DefaultEventEmitter();
  private options: DocumentDriveServerOptions | undefined;

  /**
   * Set the document models for the server
   * @param models Array of document models
   */
  public withDocumentModels(models: DocumentModel[]): this {
    this.documentModels = models;
    return this;
  }

  /**
   * Set the storage implementation
   * @param storage Storage implementation
   */
  public withStorage(storage: IDriveStorage): this {
    this.storage = storage;
    return this;
  }

  /**
   * Set the cache implementation
   * @param cache Cache implementation
   */
  public withCache(cache: ICache): this {
    this.cache = cache;
    return this;
  }

  /**
   * Set the queue manager implementation
   * @param queueManager Queue manager implementation
   */
  public withQueueManager(queueManager: IQueueManager): this {
    this.queueManager = queueManager;
    return this;
  }

  /**
   * Set the event emitter implementation
   * @param eventEmitter Event emitter implementation
   */
  public withEventEmitter(eventEmitter: IEventEmitter): this {
    this.eventEmitter = eventEmitter;
    return this;
  }

  /**
   * Set server options
   * @param options Server configuration options
   */
  public withOptions(options: DocumentDriveServerOptions): this {
    this.options = options;
    return this;
  }

  /**
   * Build and return a new BaseDocumentDriveServer instance
   * @throws Error if document models are not provided
   */
  public build(): BaseDocumentDriveServer {
    if (!this.documentModels.length) {
      throw new Error("Document models are required to build the server");
    }

    return new BaseDocumentDriveServer(
      this.documentModels,
      this.storage,
      this.cache,
      this.queueManager,
      this.eventEmitter,
      this.options,
    );
  }

  /**
   * Create a new builder instance
   */
  public static create(models: DocumentModel[]): DocumentDriveServerBuilder {
    return new DocumentDriveServerBuilder().withDocumentModels(models);
  }
}
