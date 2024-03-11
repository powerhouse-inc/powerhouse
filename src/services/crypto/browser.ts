import { JsonWebKeyPairStorage, JwkKeyPair } from './';

export class BrowserKeyStorage implements JsonWebKeyPairStorage {
    static #DB_NAME = 'browserKeyDB';
    static #STORE_NAME = 'keyPairs';
    static #KEY = 'keyPair';

    #db: Promise<IDBDatabase>;
    constructor() {
        this.#db = new Promise((resolve, reject) => {
            const req = indexedDB.open(BrowserKeyStorage.#DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(BrowserKeyStorage.#STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error as Error);
        });
    }

    async #useStore(mode: IDBTransactionMode = 'readwrite') {
        const database = await this.#db;
        const transaction = database.transaction(
            BrowserKeyStorage.#STORE_NAME,
            mode,
        );
        const store = transaction.objectStore(BrowserKeyStorage.#STORE_NAME);
        return store;
    }

    async saveKeyPair(keyPair: JwkKeyPair) {
        const store = await this.#useStore();
        const request = store.put(keyPair, BrowserKeyStorage.#KEY);
        return new Promise<void>((resolve, reject) => {
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                reject(new Error('Failed to save key pair'));
            };
        });
    }

    async loadKeyPair(): Promise<JwkKeyPair | undefined> {
        const store = await this.#useStore('readonly');
        const request = store.get(BrowserKeyStorage.#KEY);

        return new Promise<JwkKeyPair | undefined>((resolve, reject) => {
            request.onsuccess = () => {
                const keyPair = request.result as JwkKeyPair;
                resolve(keyPair);
            };
            request.onerror = () => {
                reject(new Error('Failed to load key pair'));
            };
        });
    }
}
