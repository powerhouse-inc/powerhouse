import { childLogger } from "#utils/logger";
import { LRUCache as BaseLRUCache, type LRUCache } from "lru-cache";
import sizeof from "object-sizeof";
import { type ICacheStorage } from "./memory.js";

/**
 * Options for configuring an LRU (Least Recently Used) cache storage.
 *
 * @property maxSize - The maximum size of the cache in bytes. This defines the upper limit
 * on the total size of objects that can be stored in the cache.
 * @property sizeCalculation - An optional function to calculate the size of an object in bytes.
 * If not provided, a default method will be used to determine the size.
 */
export interface LRUCacheStorageOptions {
  maxSize: number;
  sizeCalculation?: (object: unknown) => number;
}

/**
 * An implementation of a Least Recently Used (LRU) cache storage that evicts items
 * based on their total size in bytes. This cache storage is designed to work with
 * the InMemoryCache class to provide size-limited caching of documents and drives.
 *
 * When the cache reaches its maximum size limit, it automatically removes the least
 * recently accessed items to make space for new ones. The size of each cached item
 * is calculated using the provided sizeCalculation function (defaults to object-sizeof).
 *
 * @template Value - The type of values stored in the cache.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class LRUCacheStorage<Value extends {}> implements ICacheStorage {
  private cache: LRUCache<string, Value>;
  private logger = childLogger(["cache", "LRUCache"]);

  constructor(options: LRUCacheStorageOptions) {
    const { maxSize, sizeCalculation = sizeof } = options;
    this.cache = new BaseLRUCache<string, Value>({
      maxSize,
      sizeCalculation,
    });
    this.logger.info(`Created LRUCache with maxSize: ${maxSize} bytes`);
  }

  get(key: string) {
    return this.cache.get(key);
  }
  set(key: string, value: Value) {
    this.cache.set(key, value);
    return this;
  }
  delete(key: string) {
    return this.cache.delete(key);
  }
  clear(): void {
    return this.cache.clear();
  }
}
