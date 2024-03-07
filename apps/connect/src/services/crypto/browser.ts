import { JsonWebKeyPairStorage, JwkKeyPair } from './';

export class BrowserKeyStorage implements JsonWebKeyPairStorage {
    static #DB_NAME = 'browserKeyDB';
    static #STORE_NAME = 'keyPairs';
    static #KEY = 'keyPair';

    #store: Promise<IDBObjectStore>;

    constructor() {
        const db = indexedDB.open(BrowserKeyStorage.#DB_NAME, 1);

        db.onupgradeneeded = () => {
            const database = db.result;
            database.createObjectStore(BrowserKeyStorage.#STORE_NAME, {
                keyPath: 'id',
                autoIncrement: true,
            });
        };

        this.#store = new Promise((resolve, reject) => {
            db.onsuccess = () => {
                try {
                    const database = db.result;
                    const transaction = database.transaction(
                        BrowserKeyStorage.#STORE_NAME,
                        'readwrite',
                    );
                    const store = transaction.objectStore(
                        BrowserKeyStorage.#STORE_NAME,
                    );
                    resolve(store);
                } catch (e) {
                    reject(e as Error);
                }
            };
        });

        this.#store.catch(e => {
            throw e;
        });
    }

    async saveKeyPair(keyPair: JwkKeyPair) {
        const request = (await this.#store).put(
            keyPair,
            BrowserKeyStorage.#KEY,
        );
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
        const request = (await this.#store).get(BrowserKeyStorage.#KEY);

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
