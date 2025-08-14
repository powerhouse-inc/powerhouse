import { type PHDocument } from "document-model";
import { type ICache } from "./types.js";
import { trimResultingState } from "./util.js";

export interface ICacheStorage<Value = unknown> {
  get(key: string): Value | undefined;
  set(key: string, value: Value): this;
  delete(key: string): boolean;
  clear(): void;
}

export interface ICacheStorageManager {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  createStorage<Value extends {}>(): ICacheStorage<Value>;
}

export class CacheStorageManager implements ICacheStorageManager {
  private index = 0;
  private cache: ICacheStorage;

  constructor(cache: ICacheStorage) {
    this.cache = cache;
  }
  createStorage<Value>(): ICacheStorage<Value> {
    const index = this.index;
    this.index += 1;

    function buildKey(key: string) {
      return `${index}-${key}`;
    }

    const storage: ICacheStorage<Value> = {
      get: (key: string) => {
        return this.cache.get(buildKey(key)) as Value;
      },
      set: (key: string, value: Value): ICacheStorage<Value> => {
        this.cache.set(buildKey(key), value);
        return storage;
      },
      delete: (key) => {
        return this.cache.delete(buildKey(key));
      },
      clear: () => {
        this.cache.clear();
      },
    };
    return storage;
  }
}

class InMemoryCache implements ICache {
  private cacheStorageManager: ICacheStorageManager;
  private idToDocument: ICacheStorage<PHDocument>;

  constructor(private cache: ICacheStorage = new Map<string, unknown>()) {
    this.cacheStorageManager = new CacheStorageManager(cache);
    this.idToDocument = this.cacheStorageManager.createStorage<PHDocument>();
  }

  clear() {
    this.idToDocument.clear();
  }

  /////////////////////////////////////////////////////////////////////////////
  // ICache
  /////////////////////////////////////////////////////////////////////////////

  async setDocument(documentId: string, document: PHDocument) {
    const doc = trimResultingState(document);
    this.idToDocument.set(documentId, doc);
  }

  async getDocument<TDocument extends PHDocument>(
    documentId: string,
  ): Promise<TDocument | undefined> {
    return this.idToDocument.get(documentId) as TDocument | undefined;
  }

  async deleteDocument(documentId: string) {
    return this.idToDocument.delete(documentId);
  }
}

export default InMemoryCache;
