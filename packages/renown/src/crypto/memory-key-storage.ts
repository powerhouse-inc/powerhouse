import type { JsonWebKeyPairStorage, JwkKeyPair } from "./types.js";

export class MemoryKeyStorage implements JsonWebKeyPairStorage {
  private keyPair: JwkKeyPair | undefined;

  constructor(keyPair?: JwkKeyPair) {
    this.keyPair = keyPair;
  }

  loadKeyPair() {
    return Promise.resolve(this.keyPair);
  }

  saveKeyPair(keyPair: JwkKeyPair) {
    this.keyPair = keyPair;
    return Promise.resolve();
  }

  removeKeyPair() {
    this.keyPair = undefined;
    return Promise.resolve();
  }
}
