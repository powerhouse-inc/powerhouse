import { fromString, toString } from "uint8arrays";
import {
  DEFAULT_RENOWN_CHAIN_ID,
  DEFAULT_RENOWN_NETWORK_ID,
} from "../constants.js";
import type { CreateBearerTokenOptions, Issuer } from "../types.js";
import { createAuthBearerToken } from "../utils.js";
import type { DID, IRenownCrypto, JsonWebKeyPairStorage } from "./types.js";
import { ECDSA_ALGORITHM, ECDSA_SIGN_ALGORITHM } from "./utils.js";

export class RenownCrypto implements IRenownCrypto {
  #subtleCrypto: SubtleCrypto;
  #keyPair: CryptoKeyPair;
  #keyPairStorage: JsonWebKeyPairStorage;

  readonly did: DID;
  /** Chain id the bearer token is scoped to; keep it equal to the issuing Renown instance's. */
  readonly chainId: number;

  static algorithm = ECDSA_ALGORITHM;
  static signAlgorithm = ECDSA_SIGN_ALGORITHM;

  constructor(
    keyPairStorage: JsonWebKeyPairStorage,
    crypto: SubtleCrypto,
    keyPair: CryptoKeyPair,
    did: DID,
    chainId = Number(DEFAULT_RENOWN_CHAIN_ID),
  ) {
    this.#keyPairStorage = keyPairStorage;
    this.#subtleCrypto = crypto;
    this.#keyPair = keyPair;
    this.did = did;
    this.chainId = chainId;
  }

  get publicKey() {
    return this.#keyPair.publicKey;
  }

  async getBearerToken(
    address: string | undefined,
    options?: CreateBearerTokenOptions,
  ): Promise<string> {
    return await createAuthBearerToken(
      this.chainId,
      DEFAULT_RENOWN_NETWORK_ID,
      address || this.did,
      this.issuer,
      options,
    );
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
        return toString(signature, "base64url");
      },
      alg: "ES256",
    };
  }
}

/**
 * @deprecated Use RenownCrypto instead
 */
export class ConnectCrypto extends RenownCrypto {}
