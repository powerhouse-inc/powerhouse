import { RenownCrypto } from "./renown-crypto.js";
import type { JsonWebKeyPairStorage } from "./types.js";
import {
  exportKeyPair,
  generateKeyPair,
  importKeyPair,
  parseDid,
} from "./utils.js";

export class RenownCryptoBuilder {
  private keyPairStorage?: JsonWebKeyPairStorage;
  private subtleCrypto?: SubtleCrypto;

  withKeyPairStorage(storage: JsonWebKeyPairStorage): this {
    this.keyPairStorage = storage;
    return this;
  }

  withSubtleCrypto(crypto: SubtleCrypto): this {
    this.subtleCrypto = crypto;
    return this;
  }

  async build(): Promise<RenownCrypto> {
    if (!this.keyPairStorage) {
      throw new Error(
        "KeyPairStorage is required. Use withKeyPairStorage() to set it.",
      );
    }

    const subtleCrypto = this.subtleCrypto ?? globalThis.crypto.subtle;
    const keyPair = await this.#initializeKeyPair(
      subtleCrypto,
      this.keyPairStorage,
    );
    const did = await parseDid(keyPair, subtleCrypto);

    return new RenownCrypto(this.keyPairStorage, subtleCrypto, keyPair, did);
  }

  async #initializeKeyPair(
    subtleCrypto: SubtleCrypto,
    keyPairStorage: JsonWebKeyPairStorage,
  ): Promise<CryptoKeyPair> {
    const loadedKeyPair = await keyPairStorage.loadKeyPair();
    if (loadedKeyPair) {
      return importKeyPair(loadedKeyPair, subtleCrypto);
    }

    const keyPair = await generateKeyPair(subtleCrypto);
    const exported = await exportKeyPair(keyPair, subtleCrypto);
    await keyPairStorage.saveKeyPair(exported);
    return keyPair;
  }
}
