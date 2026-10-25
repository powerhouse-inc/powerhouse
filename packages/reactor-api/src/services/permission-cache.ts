import type { DocumentPermissionLevel } from "../utils/db.js";

/**
 * Everything an authorization decision reads about one document: its
 * protection flag (the configured default when it has no protection row), its
 * owner, the users' grant levels and the users granted each operation.
 * Addresses are stored lowercase, as the permission service writes them.
 */
export class DocumentPermissionSnapshot {
  constructor(
    readonly documentId: string,
    readonly isProtected: boolean,
    readonly ownerAddress: string | null,
    readonly grants: ReadonlyMap<string, DocumentPermissionLevel>,
    readonly operationGrants: ReadonlyMap<string, ReadonlySet<string>>,
  ) {}

  grantLevel(userAddress: string): DocumentPermissionLevel | null {
    return this.grants.get(userAddress.toLowerCase()) ?? null;
  }

  isOperationRestricted(operationType: string): boolean {
    return (this.operationGrants.get(operationType)?.size ?? 0) > 0;
  }

  hasOperationGrant(operationType: string, userAddress: string): boolean {
    return (
      this.operationGrants.get(operationType)?.has(userAddress.toLowerCase()) ??
      false
    );
  }
}

/** Loads the snapshots of the given documents; every id gets one. */
export type PermissionSnapshotLoader = (
  documentIds: string[],
) => Promise<Map<string, DocumentPermissionSnapshot>>;

export interface PermissionCacheOptions {
  /** How long an entry is served without reloading; 0 disables caching. */
  ttlMs: number;
  /** Entries kept before the least recently used one is dropped. */
  maxEntries: number;
  now: () => number;
}

export const DEFAULT_PERMISSION_CACHE_TTL_MS = 30_000;

export const DEFAULT_PERMISSION_CACHE_OPTIONS: PermissionCacheOptions = {
  ttlMs: DEFAULT_PERMISSION_CACHE_TTL_MS,
  maxEntries: 10_000,
  now: () => Date.now(),
};

class PermissionCacheEntry {
  constructor(
    readonly snapshot: DocumentPermissionSnapshot,
    readonly expiresAt: number,
  ) {}
}

/**
 * Per-process cache of document permission snapshots, keyed by document id.
 *
 * Filled on miss from the store, invalidated by the permission service after
 * each of its own writes, and expired after `ttlMs` as the safety net for
 * writes made by another process (another switchboard instance on the same
 * database) until cross-instance invalidation exists.
 *
 * A load that overlaps an invalidation still answers its caller but is not
 * stored, so a read that started before a write commits cannot repopulate
 * the cache with the pre-write rows.
 */
export class PermissionCache {
  readonly #load: PermissionSnapshotLoader;
  readonly #options: PermissionCacheOptions;
  readonly #entries = new Map<string, PermissionCacheEntry>();
  #epoch = 0;

  constructor(
    load: PermissionSnapshotLoader,
    options: PermissionCacheOptions = DEFAULT_PERMISSION_CACHE_OPTIONS,
  ) {
    this.#load = load;
    this.#options = options;
  }

  get size(): number {
    return this.#entries.size;
  }

  async get(documentId: string): Promise<DocumentPermissionSnapshot> {
    const snapshots = await this.getMany([documentId]);
    return snapshots.get(documentId)!;
  }

  /** Snapshots for every id, loading the missing and expired ones in one batch. */
  async getMany(
    documentIds: string[],
  ): Promise<Map<string, DocumentPermissionSnapshot>> {
    const now = this.#options.now();
    const result = new Map<string, DocumentPermissionSnapshot>();
    const missing: string[] = [];
    for (const documentId of new Set(documentIds)) {
      const entry = this.#entries.get(documentId);
      if (entry && entry.expiresAt > now) {
        this.#entries.delete(documentId);
        this.#entries.set(documentId, entry);
        result.set(documentId, entry.snapshot);
      } else {
        missing.push(documentId);
      }
    }
    if (missing.length === 0) {
      return result;
    }

    const epoch = this.#epoch;
    const loaded = await this.#load(missing);
    const storable = this.#options.ttlMs > 0 && epoch === this.#epoch;
    const expiresAt = this.#options.now() + this.#options.ttlMs;
    for (const documentId of missing) {
      const snapshot = loaded.get(documentId);
      if (!snapshot) {
        throw new Error(
          `Permission snapshot loader returned no snapshot for ${documentId}`,
        );
      }
      result.set(documentId, snapshot);
      if (storable) {
        this.#store(documentId, new PermissionCacheEntry(snapshot, expiresAt));
      }
    }
    return result;
  }

  invalidate(documentId: string): void {
    this.#epoch++;
    this.#entries.delete(documentId);
  }

  clear(): void {
    this.#epoch++;
    this.#entries.clear();
  }

  #store(documentId: string, entry: PermissionCacheEntry): void {
    this.#entries.delete(documentId);
    while (this.#entries.size >= this.#options.maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
    this.#entries.set(documentId, entry);
  }
}
