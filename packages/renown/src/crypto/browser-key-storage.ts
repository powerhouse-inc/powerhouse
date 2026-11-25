import type { JsonWebKeyPairStorage, JwkKeyPair } from "./types.js";

const DEFAULT_DB_NAME = "renownKeyDB";
const STORE_NAME = "keyPairs";
const KEY = "keyPair";
// This browser's pseudonym (hosted Connect without a login), beside the
// session key: a second store would need a version change open tabs block.
const PSEUDONYM_KEY = "pseudonym";

export class BrowserKeyStorage implements JsonWebKeyPairStorage {
  #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static async create(
    dbName: string = DEFAULT_DB_NAME,
  ): Promise<BrowserKeyStorage> {
    const db = await BrowserKeyStorage.#openDatabase(dbName);
    return new BrowserKeyStorage(db);
  }

  static #openDatabase(dbName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const currentVersion = db.version;
          db.close();
          const upgradeReq = indexedDB.open(dbName, currentVersion + 1);
          upgradeReq.onupgradeneeded = (event) => {
            const upgradeDb = (event.target as IDBOpenDBRequest).result;
            if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
              upgradeDb.createObjectStore(STORE_NAME);
            }
          };
          upgradeReq.onsuccess = () => resolve(upgradeReq.result);
          upgradeReq.onerror = () => reject(upgradeReq.error as Error);
        } else {
          resolve(db);
        }
      };

      req.onerror = () => reject(req.error as Error);
    });
  }

  #useStore(mode: IDBTransactionMode = "readwrite") {
    const transaction = this.#db.transaction(STORE_NAME, mode);
    return transaction.objectStore(STORE_NAME);
  }

  async saveKeyPair(keyPair: JwkKeyPair) {
    const store = this.#useStore();
    const request = store.put(keyPair, KEY);
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to save key pair"));
    });
  }

  async loadKeyPair(): Promise<JwkKeyPair | undefined> {
    const store = this.#useStore("readonly");
    const request = store.get(KEY);

    return new Promise<JwkKeyPair | undefined>((resolve, reject) => {
      request.onsuccess = () => {
        const keyPair = request.result as JwkKeyPair | undefined;
        resolve(keyPair);
      };
      request.onerror = () => reject(new Error("Failed to load key pair"));
    });
  }

  async removeKeyPair(): Promise<void> {
    const store = this.#useStore();
    const request = store.delete(KEY);

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to remove key pair"));
    });
  }

  /** This browser's pseudonym file, as kept; undefined while it has none. */
  async loadPseudonym(): Promise<unknown> {
    const request = this.#useStore("readonly").get(PSEUDONYM_KEY);
    return new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () => reject(new Error("Failed to load pseudonym"));
    });
  }

  /**
   * Keeps `file` unless a pseudonym is kept already (another tab made one
   * first); answers the one kept.
   */
  async addPseudonym(file: unknown): Promise<unknown> {
    const request = this.#useStore().add(file, PSEUDONYM_KEY);
    return new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(file);
      request.onerror = (event) => {
        if (request.error?.name !== "ConstraintError") {
          reject(new Error("Failed to keep pseudonym"));
          return;
        }
        // Not an error for the transaction: the kept one is read instead.
        event.preventDefault();
        this.loadPseudonym().then(resolve, reject);
      };
    });
  }
}
