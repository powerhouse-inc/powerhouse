// Types
export type {
  DID,
  IConnectCrypto,
  IRenownCrypto,
  JsonWebKeyPairStorage,
  JwkKeyPair,
} from "./types.js";

// Classes
export { RenownCryptoBuilder } from "./renown-crypto-builder.js";
export { ConnectCrypto, RenownCrypto } from "./renown-crypto.js";

// Storage implementations
export { BrowserKeyStorage } from "./browser-key-storage.js";
export { MemoryKeyStorage } from "./memory-key-storage.js";

// Signer utilities
export {
  createSignatureVerifier,
  RenownCryptoSigner,
  parseSignatureHashField,
  extractResultingHashFromSignature,
  signatureHasResultingHash,
} from "./signer.js";
