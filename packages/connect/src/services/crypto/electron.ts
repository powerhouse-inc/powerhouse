import { safeStorage } from 'electron';
import type ElectronStore from 'electron-store';
import type { JsonWebKeyPairStorage, JwkKeyPair } from './';

const ELECTRON_KEY_STORAGE_STORE_KEY = 'electron-key-storage';

export type KeyStorageElectronStore = {
    [ELECTRON_KEY_STORAGE_STORE_KEY]: string;
};

export class ElectronKeyStorage implements JsonWebKeyPairStorage {
    #store: ElectronStore<KeyStorageElectronStore>;

    static #STORE_KEY = ELECTRON_KEY_STORAGE_STORE_KEY;

    constructor(store: ElectronStore<KeyStorageElectronStore>) {
        this.#store = store;
    }

    saveKeyPair(keyPair: JwkKeyPair) {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Encryption is not available');
        }
        const encryptedKeyPair = JSON.stringify(
            safeStorage.encryptString(JSON.stringify(keyPair)),
        );
        console.log('SAVING', encryptedKeyPair);
        this.#store.set(ElectronKeyStorage.#STORE_KEY, encryptedKeyPair);

        return Promise.resolve();
    }

    loadKeyPair(): Promise<JwkKeyPair | undefined> {
        const encryptedKeyPair: string = this.#store.get(
            ElectronKeyStorage.#STORE_KEY,
        );
        if (!encryptedKeyPair) {
            return Promise.resolve(undefined);
        }

        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Encryption is not available');
        }

        const encriptedBuffer = JSON.parse(encryptedKeyPair) as ArrayBuffer;

        const decryptedKeyPair = safeStorage.decryptString(
            Buffer.from(encriptedBuffer),
        );

        return Promise.resolve(JSON.parse(decryptedKeyPair) as JwkKeyPair);
    }
}
