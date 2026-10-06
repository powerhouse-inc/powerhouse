// Browser cache for runtime data that is the same for every caller: the piece
// catalog and piece block forms. Nothing caller-scoped is ever written.
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import { CORE_PIECE_NAME } from "@powerhousedao/pieces-framework/workflow";
import { queryKind } from "./ui/query-keys.js";

// Bump when the cached shapes, or how forms are derived, change.
export const RUNTIME_CACHE_VERSION = 2;
export const RUNTIME_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export interface PersistedQuery {
  id: string;
  url: string;
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
  version: number;
}

export interface RuntimeCacheStore {
  load: (url: string) => Promise<PersistedQuery[]>;
  save: (entry: PersistedQuery) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function shouldPersistQuery(queryKey: QueryKey): boolean {
  if (typeof queryKey[0] !== "string") return false;
  const kind = queryKind(queryKey);
  if (kind === "catalog") return queryKey.length === 2;
  if (kind === "form") {
    const block = queryKey[2];
    // Core forms change with each reactor build; never pin a copy.
    return Array.isArray(block) && block[0] !== CORE_PIECE_NAME;
  }
  return false;
}

// Hydrates `url`'s entries, then writes every persistable fetch back.
export function persistRuntimeQueries(
  queryClient: QueryClient,
  url: string,
  store: RuntimeCacheStore | null,
  now: () => number = Date.now,
): { ready: Promise<void>; dispose: () => void } {
  if (!store) return { ready: Promise.resolve(), dispose: () => undefined };
  const ready = hydrate(queryClient, url, store, now());
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    // Manual writes are hydration or optimistic updates, not fetches.
    if (event.action.manual) return;
    const query = event.query as Query<unknown, Error, unknown, QueryKey>;
    const { queryKey, state } = query;
    if (!shouldPersistQuery(queryKey) || state.data === undefined) return;
    store
      .save({
        id: JSON.stringify(queryKey),
        url: queryKey[0] as string,
        queryKey,
        data: state.data,
        updatedAt: state.dataUpdatedAt,
        version: RUNTIME_CACHE_VERSION,
      })
      .catch(() => undefined);
  });
  return { ready, dispose: unsubscribe };
}

async function hydrate(
  queryClient: QueryClient,
  url: string,
  store: RuntimeCacheStore,
  at: number,
): Promise<void> {
  let entries: PersistedQuery[];
  try {
    entries = await store.load(url);
  } catch {
    return;
  }
  for (const entry of entries) {
    const expired =
      entry.version !== RUNTIME_CACHE_VERSION ||
      at - entry.updatedAt > RUNTIME_CACHE_MAX_AGE_MS ||
      !shouldPersistQuery(entry.queryKey);
    if (expired) {
      store.remove(entry.id).catch(() => undefined);
      continue;
    }
    const current = queryClient.getQueryState(entry.queryKey);
    // A fetch that landed first is newer than anything on disk.
    if (current && current.dataUpdatedAt >= entry.updatedAt) continue;
    queryClient.setQueryData(entry.queryKey, entry.data, {
      updatedAt: entry.updatedAt,
    });
  }
}

const DB_NAME = "ph-workflow-runtime-cache";
const STORE = "queries";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

// Null when the browser has no IndexedDB; every call rejects when it throws.
export function openIdbCacheStore(): RuntimeCacheStore | null {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return null;
  let db: Promise<IDBDatabase> | undefined;
  const open = () => {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("url", "url");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error("IndexedDB unavailable"));
      req.onblocked = () => reject(new Error("IndexedDB blocked"));
    });
    db.catch(() => (db = undefined));
    return db;
  };
  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const database = await open();
    return request(run(database.transaction(STORE, mode).objectStore(STORE)));
  };
  return {
    load: (url) =>
      withStore("readonly", (store) =>
        store.index("url").getAll(url),
      ) as Promise<PersistedQuery[]>,
    save: (entry) =>
      withStore("readwrite", (store) => store.put(entry)).then(() => undefined),
    remove: (id) =>
      withStore("readwrite", (store) => store.delete(id)).then(() => undefined),
  };
}
