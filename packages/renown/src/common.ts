import {
  IRenown,
  PowerhouseVerifiableCredential,
  RenownEventEmitter,
  RenownEvents,
  RenownStorage,
  User,
} from "./types.js";
import { DEFAULT_RENOWN_URL } from "./constants.js";
import { parsePkhDid } from "./utils.js";

export class Renown implements IRenown {
  #baseUrl: string;
  #store: RenownStorage;
  #connectId: string;
  #eventEmitter: RenownEventEmitter;

  constructor(
    store: RenownStorage,
    eventEmitter: RenownEventEmitter,
    connectId: string,
    baseUrl = DEFAULT_RENOWN_URL,
  ) {
    this.#store = store;
    this.#eventEmitter = eventEmitter;
    this.#connectId = connectId;
    this.#baseUrl = baseUrl;

    if (this.user) {
      this.login(this.user.did).catch(() => void 0);
    }
  }

  get user() {
    return this.#store.get("user");
  }

  #updateUser(user: User | undefined) {
    if (user) {
      this.#store.set("user", user);
    } else {
      this.#store.delete("user");
    }
    this.#eventEmitter.emit("user", user);
  }

  set connectId(connectId: string) {
    this.#connectId = connectId;
    const user = this.user;

    this.#updateUser(undefined);

    // tries to login with new connectId
    if (user) {
      this.login(user.did).catch((e: unknown) => {
        console.log("User no longer authenticated:", e);
      });
    }
  }

  async login(did: string): Promise<User> {
    try {
      const result = parsePkhDid(did);

      const credential = await this.#getCredential(
        result.address,
        result.chainId,
        this.#connectId,
      );
      if (!credential) {
        this.#updateUser(undefined);
        throw new Error("Credential not found");
      }
      const user: User = {
        ...result,
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
    connectId: string,
  ): Promise<PowerhouseVerifiableCredential | undefined> {
    if (!this.#baseUrl) {
      throw new Error("RENOWN_URL is not set");
    }
    const url = new URL(
      `/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(chainId)}&connectId=${encodeURIComponent(connectId)}`,
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
      throw new Error("Failed to get credential");
    }
  }
}
