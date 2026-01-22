/* eslint-disable no-unused-private-class-members */

import { bytesToBase64url } from "did-jwt";
import type { Issuer } from "did-jwt-vc";
import {
  compressedKeyInHexfromRaw,
  encodeDIDfromHexString,
  rawKeyInHexfromUncompressed,
} from "did-key-creator";
import { fromString } from "uint8arrays";
import {
  createAuthBearerToken,
  type CreateBearerTokenOptions,
} from "../utils.js";

export { MemoryKeyStorage } from "./memory-key-storage.js";

// Export the proper BrowserKeyStorage implementation
export { BrowserKeyStorage } from "./browser-key-storage.js";

const RENOWN_NETWORK_ID = "eip155";
const RENOWN_CHAIN_ID = 1;

export type JwkKeyPair = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

export interface JsonWebKeyPairStorage {
  loadKeyPair(): Promise<JwkKeyPair | undefined>;
  saveKeyPair(keyPair: JwkKeyPair): Promise<void>;
}

function ab2hex(ab: ArrayBuffer) {
  return Array.prototype.map
    .call(new Uint8Array(ab), (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

export interface IRenownCrypto {
  did: () => Promise<DID>;
  regenerateDid(): Promise<void>;
  sign: (data: Uint8Array) => Promise<Uint8Array>;
  getIssuer: () => Promise<Issuer>;
  getBearerToken: (
    driveUrl: string,
    address: string | undefined,
    refresh?: boolean,
    options?: CreateBearerTokenOptions,
  ) => Promise<string>;
}

/**
 * @deprecated Use IRenownCrypto instead
 */
export interface IConnectCrypto extends IRenownCrypto {}

export type DID = `did:${string}`;

export class RenownCrypto implements IRenownCrypto {
  #subtleCrypto: SubtleCrypto;
  #keyPair: CryptoKeyPair | undefined;
  #keyPairStorage: JsonWebKeyPairStorage;

  #did: Promise<DID>;
  #bearerToken: string | undefined;

  static algorithm: EcKeyAlgorithm = {
    name: "ECDSA",
    namedCurve: "P-256",
  };

  static signAlgorithm = {
    name: "ECDSA",
    namedCurve: "P-256",
    hash: "SHA-256",
  };

  constructor(
    keyPairStorage: JsonWebKeyPairStorage,
    crypto: SubtleCrypto = globalThis.crypto.subtle,
  ) {
    this.#keyPairStorage = keyPairStorage;

    this.#subtleCrypto = crypto;

    this.#did = this.#initialize();
  }

  // loads the key pair from storage or generates a new one if none is stored
  async #initialize() {
    const loadedKeyPair = await this.#keyPairStorage.loadKeyPair();
    if (loadedKeyPair) {
      this.#keyPair = await this.#importKeyPair(loadedKeyPair);
    } else {
      this.#keyPair = await this.#generateECDSAKeyPair();
      await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
    }
    const did = await this.#parseDid();
    return did;
  }

  async getBearerToken(
    driveUrl: string,
    address: string | undefined,
    refresh = false,
    options?: CreateBearerTokenOptions,
  ): Promise<string> {
    const issuer = await this.getIssuer();
    if (refresh || !this.#bearerToken) {
      this.#bearerToken = await createAuthBearerToken(
        Number(RENOWN_CHAIN_ID),
        RENOWN_NETWORK_ID,
        address || (await this.#did),
        issuer,
        options,
      );
    }

    if (!this.#bearerToken) {
      throw new Error("Could not create bearer token");
    }

    return this.#bearerToken;
  }

  did() {
    return this.#did;
  }

  async regenerateDid() {
    this.#keyPair = await this.#generateECDSAKeyPair();
    await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
  }

  async #parseDid(): Promise<DID> {
    if (!this.#keyPair) {
      throw new Error("No key pair available");
    }

    const publicKeyRaw = await this.#subtleCrypto.exportKey(
      "raw",
      this.#keyPair.publicKey,
    );

    const multicodecName = "p256-pub";
    const rawKey = rawKeyInHexfromUncompressed(ab2hex(publicKeyRaw));
    const compressedKey = compressedKeyInHexfromRaw(rawKey);
    const did = encodeDIDfromHexString(multicodecName, compressedKey);
    return did as DID;
  }

  async #generateECDSAKeyPair() {
    const keyPair = await this.#subtleCrypto.generateKey(
      ConnectCrypto.algorithm,
      true,
      ["sign", "verify"],
    );
    return keyPair;
  }

  async #exportKeyPair(): Promise<JwkKeyPair> {
    if (!this.#keyPair) {
      throw new Error("No key pair available");
    }
    const jwkKeyPair = {
      publicKey: await this.#subtleCrypto.exportKey(
        "jwk",
        this.#keyPair.publicKey,
      ),
      privateKey: await this.#subtleCrypto.exportKey(
        "jwk",
        this.#keyPair.privateKey,
      ),
    };
    return jwkKeyPair;
  }

  async #importKeyPair(jwkKeyPair: JwkKeyPair): Promise<CryptoKeyPair> {
    return {
      publicKey: await this.#subtleCrypto.importKey(
        "jwk",
        jwkKeyPair.publicKey,
        ConnectCrypto.algorithm,
        true,
        ["verify"],
      ),
      privateKey: await this.#subtleCrypto.importKey(
        "jwk",
        jwkKeyPair.privateKey,
        ConnectCrypto.algorithm,
        true,
        ["sign"],
      ),
    };
  }

  #sign = async (
    ...args: Parameters<SubtleCrypto["sign"]>
  ): Promise<ArrayBuffer> => {
    return await this.#subtleCrypto.sign(...args);
  };

  #verify = async (
    ...args: Parameters<SubtleCrypto["verify"]>
  ): Promise<boolean> => {
    return await this.#subtleCrypto.verify(...args);
  };

  #stringToBytes(s: string): Uint8Array {
    return fromString(s, "utf-8");
  }

  async sign(data: Uint8Array | string): Promise<Uint8Array> {
    if (this.#keyPair?.privateKey) {
      const dataBytes: Uint8Array =
        typeof data === "string" ? this.#stringToBytes(data) : data;

      const arrayBuffer = await this.#subtleCrypto.sign(
        ConnectCrypto.signAlgorithm,
        this.#keyPair.privateKey,
        dataBytes.buffer as ArrayBuffer,
      );

      return new Uint8Array(arrayBuffer);
    } else {
      throw new Error("No private key available");
    }
  }

  async getIssuer(): Promise<Issuer> {
    if (!this.#keyPair?.privateKey) {
      throw new Error("No private key available");
    }

    return {
      did: await this.#did,
      signer: async (data: string | Uint8Array) => {
        const signature = await this.sign(
          typeof data === "string" ? new TextEncoder().encode(data) : data,
        );
        return bytesToBase64url(signature);
      },
      alg: "ES256",
    };
  }
}

/**
 * @deprecated Use RenownCrypto instead
 */
export class ConnectCrypto extends RenownCrypto {}

export { createSignatureVerifier, RenownCryptoSigner } from "./signer.js";
