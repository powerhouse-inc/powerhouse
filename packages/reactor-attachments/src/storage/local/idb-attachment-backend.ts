import type { AttachmentHash } from "@powerhousedao/reactor";
import type {
  ILocalAttachmentBackend,
  LocalAttachmentRecord,
} from "./types.js";

/** Metadata rows, keyed by content hash. */
export const IDB_RECORD_STORE = "records";
/** Blob rows (`{ hash, bytes }`), keyed by the same content hash. */
export const IDB_BLOB_STORE = "blobs";
/** Index over {@link LocalAttachmentRecord.status}; what `storageUsed()` scans. */
export const IDB_STATUS_INDEX = "by_status";
/** Default database name. One database holds one reactor's attachment store. */
export const DEFAULT_IDB_DATABASE = "ph-attachments";
const IDB_VERSION = 1;

/** A blob row as it is stored. `bytes` is an ArrayBuffer: natively clone-safe. */
type BlobRow = {
  hash: AttachmentHash;
  bytes: ArrayBuffer;
};

export type IdbAttachmentBackendOptions = {
  /**
   * Database name; defaults to {@link DEFAULT_IDB_DATABASE}. A host running
   * several reactors in one origin must namespace this per reactor, exactly as
   * the operation store is namespaced -- two reactors sharing one attachment
   * database would share evictions and storage accounting.
   */
  databaseName?: string;
  /**
   * The factory to open against; defaults to the realm's `indexedDB`. The seam
   * a shim (or a test double) is injected through, and the reason this backend
   * takes no dependency on a global being present at import time.
   */
  indexedDB?: IDBFactory;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * An IndexedDB-backed {@link ILocalAttachmentBackend}: the browser-resident
 * attachment store a reactor in a tab or a SharedWorker replicates into
 * (multi-reactor W3.4).
 *
 * Two object stores, written in one transaction so a record and its blob land
 * or fail together (the atomicity {@link ILocalAttachmentBackend.write}
 * requires). Bytes are kept as `ArrayBuffer` rather than `Blob`: both are
 * structured-clone-safe values IndexedDB stores natively, and an ArrayBuffer
 * needs no async read to get back to the `Uint8Array` the store serves.
 *
 * OPFS is the obvious later alternative for large blobs -- it streams and does
 * not hold a whole attachment in the realm's heap -- and nothing above this
 * interface would change: it is one more backend.
 *
 * The database handle is opened lazily on first use and reused, so constructing
 * this in a realm that has no `indexedDB` (a Node import of the barrel) costs
 * nothing and fails only if something actually reads or writes.
 */
export class IdbAttachmentBackend implements ILocalAttachmentBackend {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private opening: Promise<IDBDatabase> | undefined;
  private database: IDBDatabase | undefined;
  private closed = false;

  constructor(options: IdbAttachmentBackendOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_IDB_DATABASE;
    this.factory = options.indexedDB ?? globalThis.indexedDB;
  }

  async readRecord(
    hash: AttachmentHash,
  ): Promise<LocalAttachmentRecord | undefined> {
    const db = await this.open();
    const transaction = db.transaction(IDB_RECORD_STORE, "readonly");
    const row = await requestResult<LocalAttachmentRecord | undefined>(
      transaction.objectStore(IDB_RECORD_STORE).get(hash) as IDBRequest<
        LocalAttachmentRecord | undefined
      >,
    );
    return row ?? undefined;
  }

  async write(record: LocalAttachmentRecord, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(
      [IDB_RECORD_STORE, IDB_BLOB_STORE],
      "readwrite",
    );
    const row: BlobRow = { hash: record.hash, bytes: toArrayBuffer(bytes) };
    transaction.objectStore(IDB_RECORD_STORE).put(record);
    transaction.objectStore(IDB_BLOB_STORE).put(row);
    await transactionDone(transaction);
  }

  async readBytes(hash: AttachmentHash): Promise<Uint8Array | undefined> {
    const db = await this.open();
    const transaction = db.transaction(IDB_BLOB_STORE, "readonly");
    const row = await requestResult<BlobRow | undefined>(
      transaction.objectStore(IDB_BLOB_STORE).get(hash) as IDBRequest<
        BlobRow | undefined
      >,
    );
    return row ? new Uint8Array(row.bytes) : undefined;
  }

  async evict(record: LocalAttachmentRecord): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(
      [IDB_RECORD_STORE, IDB_BLOB_STORE],
      "readwrite",
    );
    transaction.objectStore(IDB_RECORD_STORE).put(record);
    transaction.objectStore(IDB_BLOB_STORE).delete(record.hash);
    await transactionDone(transaction);
  }

  async touch(hash: AttachmentHash, lastAccessedAtUtc: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(IDB_RECORD_STORE, "readwrite");
    const store = transaction.objectStore(IDB_RECORD_STORE);
    const existing = await requestResult<LocalAttachmentRecord | undefined>(
      store.get(hash) as IDBRequest<LocalAttachmentRecord | undefined>,
    );
    if (existing) {
      store.put({ ...existing, lastAccessedAtUtc });
    }
    await transactionDone(transaction);
  }

  async availableBytes(): Promise<number> {
    const db = await this.open();
    const transaction = db.transaction(IDB_RECORD_STORE, "readonly");
    const index = transaction
      .objectStore(IDB_RECORD_STORE)
      .index(IDB_STATUS_INDEX);
    const rows = await requestResult<LocalAttachmentRecord[]>(
      index.getAll("available") as IDBRequest<LocalAttachmentRecord[]>,
    );
    return rows.reduce((total, row) => total + row.sizeBytes, 0);
  }

  close(): Promise<void> {
    this.closed = true;
    this.database?.close();
    this.database = undefined;
    this.opening = undefined;
    return Promise.resolve();
  }

  private open(): Promise<IDBDatabase> {
    if (this.closed) {
      return Promise.reject(
        new Error(
          `IndexedDB attachment backend for database "${this.databaseName}" is closed`,
        ),
      );
    }
    if (this.database) {
      return Promise.resolve(this.database);
    }
    this.opening ??= this.openDatabase();
    return this.opening;
  }

  private openDatabase(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (!factory) {
      // Stated rather than crashed on a missing global: this backend is
      // exported from a barrel a Node process imports, and the honest failure
      // is "this realm has no IndexedDB", not "indexedDB is undefined".
      return Promise.reject(
        new Error(
          "No IndexedDB in this realm; the IndexedDB attachment backend needs a browser realm or an injected IDBFactory",
        ),
      );
    }

    const request = factory.open(this.databaseName, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_RECORD_STORE)) {
        const records = db.createObjectStore(IDB_RECORD_STORE, {
          keyPath: "hash",
        });
        records.createIndex(IDB_STATUS_INDEX, "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(IDB_BLOB_STORE)) {
        db.createObjectStore(IDB_BLOB_STORE, { keyPath: "hash" });
      }
    };

    return requestResult(request).then((db) => {
      if (this.closed) {
        // close() ran while this open was in flight. Keeping the handle would
        // leak a connection the backend will never release (and would re-arm
        // onversionchange over a dead instance); drop it and fail this caller
        // with the same closed error open() raises up front.
        db.close();
        throw new Error(
          `IndexedDB attachment backend for database "${this.databaseName}" is closed`,
        );
      }
      this.database = db;
      // A second tab asking for a higher version must not be blocked by this
      // handle; closing here loses nothing, the next call reopens.
      db.onversionchange = () => {
        db.close();
        this.database = undefined;
        this.opening = undefined;
      };
      return db;
    });
  }
}
