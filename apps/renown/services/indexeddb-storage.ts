import type { ISafeStorage } from "../hooks/storage";

export class SafeStorage implements ISafeStorage {
    static #DB_NAME = "safeStorageDB";
    static #STORE_NAME = "safeStorage";

    #store: Promise<IDBObjectStore>;

    constructor() {
        const db = indexedDB.open(SafeStorage.#DB_NAME, 1);

        db.onupgradeneeded = () => {
            const database = db.result;
            database.createObjectStore(SafeStorage.#STORE_NAME, {
                keyPath: "id",
                autoIncrement: true,
            });
        };

        this.#store = new Promise((resolve, reject) => {
            db.onsuccess = () => {
                try {
                    const database = db.result;
                    const transaction = database.transaction(
                        SafeStorage.#STORE_NAME,
                        "readwrite"
                    );
                    const store = transaction.objectStore(
                        SafeStorage.#STORE_NAME
                    );
                    resolve(store);
                } catch (e) {
                    reject(e as Error);
                }
            };
        });

        this.#store.catch((e) => {
            throw e;
        });
    }

    async save(key: string, value: unknown): Promise<void> {
        const request = (await this.#store).put(value, key);
        return new Promise<void>((resolve, reject) => {
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                reject(new Error(`Failed to save key: ${key}`));
            };
        });
    }

    async load<T>(key: string): Promise<T | undefined> {
        const request = (await this.#store).get(key);
        return new Promise<T | undefined>((resolve, reject) => {
            request.onsuccess = () => {
                const keyPair = request.result as T;
                resolve(keyPair);
            };
            request.onerror = () => {
                reject(new Error(`Failed to load key: ${key}`));
            };
        });
    }

    async delete(key: string): Promise<void> {
        const request = (await this.#store).delete(key);
        return new Promise<void>((resolve, reject) => {
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                reject(new Error(`Failed to delete key: ${key}`));
            };
        });
    }
}
