import {
  compressedKeyInHexfromRaw,
  encodeDIDfromHexString,
  rawKeyInHexfromUncompressed,
} from "did-key-creator";
import { childLogger } from "document-drive";

const logger = childLogger(["reactor-browser", "crypto"]);

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

export interface IConnectCrypto {
  publicKey(): Promise<JsonWebKey>;
  did: () => Promise<DID>;
  regenerateDid(): Promise<void>;

  sign: (data: Uint8Array) => Promise<Uint8Array>;
  verify: (data: Uint8Array, signature: Uint8Array) => Promise<void>;
}

export type DID = `did:key:${string}`;

export class ConnectCrypto implements IConnectCrypto {
  #subtleCrypto: Promise<SubtleCrypto>;
  #keyPair: CryptoKeyPair | undefined;
  #keyPairStorage: JsonWebKeyPairStorage;

  #did: Promise<DID>;

  static algorithm: EcKeyAlgorithm = {
    name: "Ed25519",
    namedCurve: "Ed25519",
  };

  async publicKey(): Promise<JsonWebKey> {
    if (!this.#keyPair) {
      throw new Error("No key pair available");
    }
    return Promise.resolve(this.#keyPair.publicKey as JsonWebKey);
  }

  constructor(keyPairStorage: JsonWebKeyPairStorage) {
    this.#keyPairStorage = keyPairStorage;

    // Initializes the subtleCrypto module according to the host environment
    this.#subtleCrypto = this.#initCrypto();

    this.#did = this.#initialize();
  }

  #initCrypto() {
    return new Promise<SubtleCrypto>((resolve, reject) => {
      if (typeof window === "undefined") {
        import("node:crypto")
          .then((module) => {
            resolve(module.webcrypto.subtle as SubtleCrypto);
          })
          .catch(reject);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!window.crypto?.subtle) {
          reject(new Error("Crypto module not available"));
        }
        resolve(window.crypto.subtle);
      }
    });
  }

  // loads the key pair from storage or generates a new one if none is stored
  async #initialize() {
    const loadedKeyPair = await this.#keyPairStorage.loadKeyPair();
    if (loadedKeyPair) {
      // check algorithm matches
      if (loadedKeyPair.publicKey.crv?.toLowerCase() === "ed25519") {
        this.#keyPair = await this.#importKeyPair(loadedKeyPair);
        logger.info("Found key pair");
      } else {
        logger.warn("Key pair algorithm mismatch, discarding key pair");
      }
    }

    if (!this.#keyPair) {
      this.#keyPair = await this.#generateKeyPair();

      logger.info("Created key pair");
      await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
    }

    const did = await this.#parseDid();
    logger.info("App DID:", did);
    return did;
  }

  did() {
    return this.#did;
  }

  async regenerateDid() {
    this.#keyPair = await this.#generateKeyPair();
    await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
  }

  async #parseDid(): Promise<DID> {
    if (!this.#keyPair) {
      throw new Error("No key pair available");
    }

    const subtleCrypto = await this.#subtleCrypto;
    const publicKeyRaw = await subtleCrypto.exportKey(
      "raw",
      this.#keyPair.publicKey,
    );

    const multicodecName = "p256-pub";
    const rawKey = rawKeyInHexfromUncompressed(ab2hex(publicKeyRaw));
    const compressedKey = compressedKeyInHexfromRaw(rawKey);
    const did = encodeDIDfromHexString(multicodecName, compressedKey);
    return did as DID;
  }

  async #generateKeyPair() {
    const subtleCrypto = await this.#subtleCrypto;
    const keyPair = await subtleCrypto.generateKey(
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
    const subtleCrypto = await this.#subtleCrypto;
    const jwkKeyPair = {
      publicKey: await subtleCrypto.exportKey("jwk", this.#keyPair.publicKey),
      privateKey: await subtleCrypto.exportKey("jwk", this.#keyPair.privateKey),
    };
    return jwkKeyPair;
  }

  async #importKeyPair(jwkKeyPair: JwkKeyPair): Promise<CryptoKeyPair> {
    const subtleCrypto = await this.#subtleCrypto;
    return {
      publicKey: await subtleCrypto.importKey(
        "jwk",
        jwkKeyPair.publicKey,
        ConnectCrypto.algorithm,
        true,
        ["verify"],
      ),
      privateKey: await subtleCrypto.importKey(
        "jwk",
        jwkKeyPair.privateKey,
        ConnectCrypto.algorithm,
        true,
        ["sign"],
      ),
    };
  }

  // eslint-disable-next-line no-unused-private-class-members
  #sign = async (
    ...args: Parameters<SubtleCrypto["sign"]>
  ): Promise<ArrayBuffer> => {
    return (await this.#subtleCrypto).sign(...args);
  };

  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (this.#keyPair?.privateKey) {
      const subtleCrypto = await this.#subtleCrypto;

      const arrayBuffer = await subtleCrypto.sign(
        ConnectCrypto.algorithm,
        this.#keyPair.privateKey,
        data.buffer as ArrayBuffer,
      );

      return new Uint8Array(arrayBuffer);
    } else {
      throw new Error("No private key available");
    }
  }

  async verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
    if (this.#keyPair?.publicKey) {
      const subtleCrypto = await this.#subtleCrypto;

      let isValid;
      try {
        isValid = await subtleCrypto.verify(
          "Ed25519",
          this.#keyPair.publicKey,
          signature,
          data,
        );
      } catch (error) {
        throw new Error("invalid signature");
      }

      if (!isValid) {
        throw new Error("invalid signature");
      }
    } else {
      throw new Error("No public key available");
    }
  }
}
