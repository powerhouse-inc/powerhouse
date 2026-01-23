import { bytesToBase64url } from "did-jwt";
import type { Issuer } from "did-jwt-vc";
import { fromString } from "uint8arrays";
import {
  createAuthBearerToken,
  type CreateBearerTokenOptions,
} from "../utils.js";
import type { DID, IRenownCrypto, JsonWebKeyPairStorage } from "./types.js";
import { ECDSA_ALGORITHM, ECDSA_SIGN_ALGORITHM } from "./utils.js";

const RENOWN_NETWORK_ID = "eip155";
const RENOWN_CHAIN_ID = 1;

export class RenownCrypto implements IRenownCrypto {
  #subtleCrypto: SubtleCrypto;
  #keyPair: CryptoKeyPair;
  #keyPairStorage: JsonWebKeyPairStorage;
  #bearerToken: string | undefined;

  readonly did: DID;

  static algorithm = ECDSA_ALGORITHM;
  static signAlgorithm = ECDSA_SIGN_ALGORITHM;

  constructor(
    keyPairStorage: JsonWebKeyPairStorage,
    crypto: SubtleCrypto,
    keyPair: CryptoKeyPair,
    did: DID,
  ) {
    this.#keyPairStorage = keyPairStorage;
    this.#subtleCrypto = crypto;
    this.#keyPair = keyPair;
    this.did = did;
  }

  get publicKey() {
    return this.#keyPair.publicKey;
  }

  async getBearerToken(
    _driveUrl: string,
    address: string | undefined,
    refresh = false,
    options?: CreateBearerTokenOptions,
  ): Promise<string> {
    if (refresh || !this.#bearerToken) {
      this.#bearerToken = await createAuthBearerToken(
        Number(RENOWN_CHAIN_ID),
        RENOWN_NETWORK_ID,
        address || this.did,
        this.issuer,
        options,
      );
    }

    if (!this.#bearerToken) {
      throw new Error("Could not create bearer token");
    }

    return this.#bearerToken;
  }

  async removeDid(): Promise<void> {
    await this.#keyPairStorage.removeKeyPair();
  }

  #stringToBytes(s: string): Uint8Array {
    return fromString(s, "utf-8");
  }

  async sign(data: Uint8Array | string): Promise<Uint8Array> {
    const dataBytes: Uint8Array =
      typeof data === "string" ? this.#stringToBytes(data) : data;

    const arrayBuffer = await this.#subtleCrypto.sign(
      RenownCrypto.signAlgorithm,
      this.#keyPair.privateKey,
      dataBytes.buffer as ArrayBuffer,
    );

    return new Uint8Array(arrayBuffer);
  }

  async verify(data: Uint8Array, signature: Uint8Array): Promise<boolean> {
    return this.#subtleCrypto.verify(
      { name: "ECDSA", hash: "SHA-256" },
      this.#keyPair.publicKey,
      signature.buffer as ArrayBuffer,
      data.buffer as ArrayBuffer,
    );
  }

  get issuer(): Issuer {
    return {
      did: this.did,
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
