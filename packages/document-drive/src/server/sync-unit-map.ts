import { type SynchronizationUnitId } from "./types.js";

/**
 * Interface for a specialized Map implementation that manages synchronization units.
 * Each unit is identified by a SynchronizationUnitId which consists of documentId, scope, and branch.
 */
export interface ISyncUnitMap<Value> {
  set(id: SynchronizationUnitId, state: Value): this;
  get(id: SynchronizationUnitId): Value | undefined;
  has(id: SynchronizationUnitId): boolean;
  delete(id: SynchronizationUnitId): boolean;
  clear(): void;
  get size(): number;
  keys(): IterableIterator<SynchronizationUnitId>;
  values(): IterableIterator<Value>;
  entries(): IterableIterator<[SynchronizationUnitId, Value]>;
  [Symbol.iterator](): IterableIterator<[SynchronizationUnitId, Value]>;
  forEach(
    callbackfn: (
      value: Value,
      key: SynchronizationUnitId,
      map: ISyncUnitMap<Value>,
    ) => void,
    thisArg?: any,
  ): void;
  deleteByDocumentId(documentId: string): void;
  deleteByDocumentIdAndScope(documentId: string, scope: string): void;
  getAllByDocumentId(documentId: string): [SynchronizationUnitId, Value][];
  getAllByDocumentIdAndScope(
    documentId: string,
    scope: string,
  ): [SynchronizationUnitId, Value][];
}

/** Separator character used to join synchronization unit key parts */
type SyncUnitKeySeparator = "|";

/**
 * Internal key format used to store synchronization units.
 * Composed of documentId, scope, and branch joined by the separator.
 */
type SyncUnitKey =
  `${SynchronizationUnitId["documentId"]}${SyncUnitKeySeparator}${SynchronizationUnitId["scope"]}${SyncUnitKeySeparator}${SynchronizationUnitId["branch"]}`;

/**
 * A specialized Map implementation for managing synchronization units that uses a "documentId - scope - branch" tuple as key.
 * It provides methods to store, retrieve, and delete synchronization units of a certain documentId, optionally a scope and a branch.
 * The implementation uses an internal Map with string keys created by combining documentId, scope, and branch with a separator character.
 */
export class SyncUnitMap<Value> implements ISyncUnitMap<Value> {
  /** Internal storage using concatenated string keys */
  private internalMap = new Map<SyncUnitKey, Value>();

  /** Character used to separate key components */
  static keySeparator: SyncUnitKeySeparator = "|";

  /**
   * Escapes the separator character in a string by prefixing it with a backslash
   * @param str String to escape
   */
  private static escape(str: string): string {
    return str.replace(/\|/g, "\\|");
  }

  /**
   * Unescapes the separator character in a string by removing the prefix backslash
   * @param str String to unescape
   */
  private static unescape(str: string): string {
    return str.replace(/\\\|/g, "|");
  }

  /**
   * Creates a composite key from a SynchronizationUnitId
   * Escapes any separator characters in the components
   * @param id The synchronization unit identifier
   * @returns A string key combining documentId, scope, and branch
   */
  static buildKey(id: SynchronizationUnitId): SyncUnitKey {
    return `${SyncUnitMap.escape(id.documentId)}${SyncUnitMap.keySeparator}${SyncUnitMap.escape(id.scope)}${SyncUnitMap.keySeparator}${SyncUnitMap.escape(id.branch)}`;
  }

  /**
   * Parses a composite key back into a SynchronizationUnitId
   * Unescapes any separator characters in the components
   * @param key The composite key string
   * @returns The parsed synchronization unit identifier
   */
  static parseKey(key: SyncUnitKey): SynchronizationUnitId {
    const parts = key
      .split(/(?<!\\)\|/)
      .map((part: string) => SyncUnitMap.unescape(part));

    const [documentId, scope, branch] = parts;
    return { documentId, scope, branch };
  }

  // Map API implementation

  /**
   * Stores a value with the given synchronization unit identifier
   * @throws Error if any part of the id contains the separator character
   */
  set(id: SynchronizationUnitId, state: Value): this {
    this.internalMap.set(SyncUnitMap.buildKey(id), state);
    return this;
  }

  /** Retrieves a value by its synchronization unit identifier */
  get(id: SynchronizationUnitId): Value | undefined {
    return this.internalMap.get(SyncUnitMap.buildKey(id));
  }

  /** Checks if a value exists for the given synchronization unit identifier */
  has(id: SynchronizationUnitId): boolean {
    return this.internalMap.has(SyncUnitMap.buildKey(id));
  }

  /** Removes a value by its synchronization unit identifier */
  delete(id: SynchronizationUnitId): boolean {
    return this.internalMap.delete(SyncUnitMap.buildKey(id));
  }

  /** Removes all entries from the map */
  clear(): void {
    this.internalMap.clear();
  }

  /** Returns the number of entries in the map */
  get size(): number {
    return this.internalMap.size;
  }

  /**
   * Returns an iterator of synchronization unit identifiers
   * @param filter Optional filter by documentId and scope
   */
  keys(
    filter?: { documentId: string; scope?: string } | undefined,
  ): IterableIterator<SynchronizationUnitId> {
    const iter = this.internalMap.keys();
    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<SynchronizationUnitId> {
        while (true) {
          const result = iter.next();
          if (result.done) return { done: true, value: undefined };
          const key = result.value;
          const id = SyncUnitMap.parseKey(key);
          if (filter) {
            if (id.documentId !== filter.documentId) continue;
            if (filter.scope !== undefined && id.scope !== filter.scope)
              continue;
          }
          return { done: false, value: id };
        }
      },
    };
  }

  /**
   * Returns an iterator of stored values
   * @param filter Optional filter by documentId and scope
   */
  values(
    filter?: { documentId: string; scope?: string } | undefined,
  ): IterableIterator<Value> {
    const iter = this.internalMap.entries();
    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<Value> {
        while (true) {
          const result = iter.next();
          if (result.done) return { done: true, value: undefined };
          const [key, value] = result.value;
          const id = SyncUnitMap.parseKey(key);
          if (filter) {
            if (id.documentId !== filter.documentId) continue;
            if (filter.scope !== undefined && id.scope !== filter.scope)
              continue;
          }
          return { done: false, value };
        }
      },
    };
  }

  /**
   * Returns an iterator of [id, value] pairs
   * @param filter Optional filter by documentId and scope
   */
  entries(
    filter?: { documentId: string; scope?: string } | undefined,
  ): IterableIterator<[SynchronizationUnitId, Value]> {
    const iter = this.internalMap.entries();
    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<[SynchronizationUnitId, Value]> {
        while (true) {
          const result = iter.next();
          if (result.done) return { done: true, value: undefined };
          const [key, value] = result.value;
          const id = SyncUnitMap.parseKey(key);
          if (filter) {
            if (id.documentId !== filter.documentId) continue;
            if (filter.scope !== undefined && id.scope !== filter.scope)
              continue;
          }
          return {
            done: false,
            value: [id, value],
          };
        }
      },
    };
  }

  /** Makes the map iterable */
  [Symbol.iterator]() {
    return this.entries();
  }

  /**
   * Executes a callback for each entry in the map
   * @param callbackfn Function to execute for each entry
   * @param thisArg Value to use as 'this' in the callback
   */
  forEach(
    callbackfn: (
      value: Value,
      key: SynchronizationUnitId,
      map: ISyncUnitMap<Value>,
    ) => void,
    thisArg?: any,
  ): void {
    for (const [k, v] of this.entries()) {
      callbackfn.call(thisArg, v, k, this);
    }
  }

  // Custom API methods

  /**
   * Removes all entries associated with a specific document
   * @param documentId The document identifier
   */
  deleteByDocumentId(documentId: string): void {
    for (const key of this.internalMap.keys()) {
      if (key.startsWith(documentId + SyncUnitMap.keySeparator)) {
        this.internalMap.delete(key);
      }
    }
  }

  /**
   * Removes all entries for a specific document and scope combination
   * @param documentId The document identifier
   * @param scope The scope identifier
   */
  deleteByDocumentIdAndScope(documentId: string, scope: string): void {
    const prefix = `${documentId}${SyncUnitMap.keySeparator}${scope}${SyncUnitMap.keySeparator}`;
    for (const key of this.internalMap.keys()) {
      if (key.startsWith(prefix)) {
        this.internalMap.delete(key);
      }
    }
  }

  /**
   * Retrieves all entries associated with a specific document
   * @param documentId The document identifier
   * @returns Array of [id, value] pairs
   */
  getAllByDocumentId(documentId: string): [SynchronizationUnitId, Value][] {
    const results: [SynchronizationUnitId, Value][] = [];
    for (const [key, value] of this.internalMap.entries()) {
      if (key.startsWith(documentId + SyncUnitMap.keySeparator)) {
        results.push([SyncUnitMap.parseKey(key), value]);
      }
    }
    return results;
  }

  /**
   * Retrieves all entries for a specific document and scope combination
   * @param documentId The document identifier
   * @param scope The scope identifier
   * @returns Array of [id, value] pairs
   */
  getAllByDocumentIdAndScope(
    documentId: string,
    scope: string,
  ): [SynchronizationUnitId, Value][] {
    const prefix = `${documentId}${SyncUnitMap.keySeparator}${scope}${SyncUnitMap.keySeparator}`;
    const results: [SynchronizationUnitId, Value][] = [];
    for (const [key, value] of this.internalMap.entries()) {
      if (key.startsWith(prefix)) {
        results.push([SyncUnitMap.parseKey(key), value]);
      }
    }
    return results;
  }
}
