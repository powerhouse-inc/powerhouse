import { safeStorage } from 'electron';
import type ElectronStore from 'electron-store';
import { JsonWebKeyPairStorage, JwkKeyPair } from 'src/utils/crypto';

export class ElectronKeyStorage implements JsonWebKeyPairStorage {
    #store: ElectronStore;

    static #STORE_KEY = 'connectkeyPair';

    constructor(store: ElectronStore) {
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
        const encryptedKeyPair = this.#store.get(
            ElectronKeyStorage.#STORE_KEY,
        ) as string;
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
