import type { Issuer } from "did-jwt-vc";
import type { CreateBearerTokenOptions } from "../types.js";

export type JwkKeyPair = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

export interface JsonWebKeyPairStorage {
  loadKeyPair(): Promise<JwkKeyPair | undefined>;
  saveKeyPair(keyPair: JwkKeyPair): Promise<void>;
  removeKeyPair(): Promise<void>;
}

export type DID = `did:${string}`;

export interface IRenownCrypto {
  did: DID;
  publicKey: CryptoKey;
  removeDid(): Promise<void>;
  sign: (data: Uint8Array) => Promise<Uint8Array>;
  verify: (data: Uint8Array, signature: Uint8Array) => Promise<boolean>;
  issuer: Issuer;
  getBearerToken: (
    address: string | undefined,
    options?: CreateBearerTokenOptions,
  ) => Promise<string>;
}

/**
 * @deprecated Use IRenownCrypto instead
 */
export interface IConnectCrypto extends IRenownCrypto {}
