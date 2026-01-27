import type { ISigner } from "document-model";
import { DEFAULT_RENOWN_URL } from "./constants.js";
import { RenownCryptoSigner, type IRenownCrypto } from "./crypto/index.js";
import { MemoryStorage } from "./storage/common.js";
import type {
  CreateBearerTokenOptions,
  IRenown,
  PowerhouseVerifiableCredential,
  RenownEventEmitter,
  RenownEvents,
  RenownStorage,
  RenownStorageMap,
  User,
} from "./types.js";
import { parsePkhDid, verifyAuthBearerToken } from "./utils.js";

export class RenownMemoryStorage extends MemoryStorage<RenownStorageMap> {}

export class Renown implements IRenown {
  #baseUrl: string;
  #store: RenownStorage;
  #eventEmitter: RenownEventEmitter;
  #appName: string;
  #crypto: IRenownCrypto;
  #signer: ISigner;

  constructor(
    store: RenownStorage,
    eventEmitter: RenownEventEmitter,
    crypto: IRenownCrypto,
    appName: string,
    baseUrl = DEFAULT_RENOWN_URL,
  ) {
    this.#store = store;
    this.#eventEmitter = eventEmitter;
    this.#baseUrl = baseUrl;
    this.#crypto = crypto;
    this.#appName = appName;
    this.#signer = new RenownCryptoSigner(crypto, this.#appName, this.user);

    this.on("user", (user) => {
      this.#signer.user = user;
    });
  }

  get user() {
    return this.#store.get("user");
  }

  get signer() {
    return this.#signer;
  }

  get did() {
    return this.#crypto.did;
  }

  #updateUser(user: User | undefined) {
    if (user) {
      this.#store.set("user", user);
    } else {
      this.#store.delete("user");
    }
    this.#eventEmitter.emit("user", user);
  }

  async login(did: string): Promise<User> {
    try {
      const result = parsePkhDid(did);
      console.log(result, this.#crypto.did);
      const credential = await this.#getCredential(
        result.address,
        result.chainId,
        this.#crypto.did,
      );

      if (!credential) {
        this.#updateUser(undefined);
        throw new Error("Credential not found");
      }
      const user: User = {
        ...result,
        address: credential.issuer.ethereumAddress,
        did,
        credential,
      };

      // TODO
      //   getEnsInfo(user.address, user.chainId)
      //     .then((ens) => {
      //       if (
      //         this.user?.address === user.address &&
      //         this.user.chainId === user.chainId
      //       ) {
      //         this.#updateUser({ ...this.user, ens });
      //       }
      //     })
      //     .catch(logger.error);

      this.#updateUser(user);
      return user;
    } catch (error) {
      this.#updateUser(undefined);
      throw error;
    }
  }

  logout() {
    this.#updateUser(undefined);
    return Promise.resolve();
  }

  on<K extends keyof RenownEvents>(
    event: K,
    listener: (data: RenownEvents[K]) => void,
  ): () => void {
    return this.#eventEmitter.on(event, listener);
  }

  async #getCredential(
    address: string,
    chainId: number,
    appDid: string,
  ): Promise<PowerhouseVerifiableCredential | undefined> {
    if (!this.#baseUrl) {
      throw new Error("RENOWN_URL is not set");
    }
    const url = new URL(
      `/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(chainId)}&connectId=${encodeURIComponent(appDid)}`,
      this.#baseUrl,
    );
    const response = await fetch(url, {
      method: "GET",
    });
    if (response.ok) {
      const result = (await response.json()) as {
        credential: PowerhouseVerifiableCredential;
      };
      return result.credential;
    } else {
      throw new Error(`Failed to get credential: ${response.status}`);
    }
  }

  async verifyBearerToken(token: string) {
    return verifyAuthBearerToken(token);
  }

  async getBearerToken(options: CreateBearerTokenOptions) {
    if (!this.user) {
      throw new Error("User not found");
    }
    return this.#crypto.getBearerToken(this.user.address, options);
  }
}
