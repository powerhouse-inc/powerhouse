import { Renown, RenownMemoryStorage } from "./common.js";
import { DEFAULT_RENOWN_URL } from "./constants.js";
import { RenownCryptoBuilder } from "./crypto/renown-crypto-builder.js";
import type { IRenownCrypto, JsonWebKeyPairStorage } from "./crypto/types.js";
import { MemoryEventEmitter } from "./event/memory.js";
import type { RenownEventEmitter, RenownStorage } from "./types.js";

export interface RenownBuilderOptions {
  appName: string;
  storage?: RenownStorage;
  eventEmitter?: RenownEventEmitter;
  crypto?: IRenownCrypto;
  keyPairStorage?: JsonWebKeyPairStorage;
  baseUrl?: string;
}

/**
 * Base builder for creating Renown instances.
 * Use platform-specific builders (RenownBuilder from init.browser.js or init.node.js)
 * for pre-configured defaults.
 */
export class BaseRenownBuilder {
  #appName: string;
  #storage?: RenownStorage;
  #eventEmitter?: RenownEventEmitter;
  #crypto?: IRenownCrypto;
  #keyPairStorage?: JsonWebKeyPairStorage;
  #baseUrl?: string;

  /**
   * @param appName - Application name used for signing context
   */
  constructor(appName: string) {
    this.#appName = appName;
  }

  /**
   * Set custom storage for user data persistence.
   * Defaults to in-memory storage if not set.
   */
  withStorage(storage: RenownStorage): this {
    this.#storage = storage;
    return this;
  }

  /**
   * Set custom event emitter for user state changes.
   * Defaults to in-memory event emitter if not set.
   */
  withEventEmitter(eventEmitter: RenownEventEmitter): this {
    this.#eventEmitter = eventEmitter;
    return this;
  }

  /**
   * Set a pre-built crypto instance.
   * Either crypto or keyPairStorage must be provided.
   */
  withCrypto(crypto: IRenownCrypto): this {
    this.#crypto = crypto;
    return this;
  }

  /**
   * Set key pair storage for cryptographic keys.
   * A crypto instance will be built from this storage.
   * Either crypto or keyPairStorage must be provided.
   */
  withKeyPairStorage(keyPairStorage: JsonWebKeyPairStorage): this {
    this.#keyPairStorage = keyPairStorage;
    return this;
  }

  /**
   * Set the Renown server URL for credential verification.
   * Defaults to https://www.renown.id
   */
  withBaseUrl(baseUrl: string): this {
    this.#baseUrl = baseUrl;
    return this;
  }

  /**
   * Build and initialize the Renown instance.
   * If a user is stored, attempts to re-authenticate them.
   * @throws Error if neither crypto nor keyPairStorage is provided
   */
  async build(): Promise<Renown> {
    if (!this.#crypto && !this.#keyPairStorage) {
      throw new Error(
        "Either crypto or keyPairStorage is required. Use withCrypto() or withKeyPairStorage() to set one.",
      );
    }

    const crypto =
      this.#crypto ??
      (await new RenownCryptoBuilder()
        .withKeyPairStorage(this.#keyPairStorage!)
        .build());

    const storage = this.#storage ?? new RenownMemoryStorage();
    const eventEmitter = this.#eventEmitter ?? new MemoryEventEmitter();
    const baseUrl = this.#baseUrl ?? DEFAULT_RENOWN_URL;

    const renown = new Renown(
      storage,
      eventEmitter,
      crypto,
      this.#appName,
      baseUrl,
    );

    // Re-authenticate stored user if present
    if (renown.user) {
      try {
        await renown.login(renown.user.did);
      } catch (error) {
        console.error("Failed to re-authenticate user:", error);
      }
    }

    return renown;
  }

  /**
   * Create a BaseRenownBuilder from options object for a more concise API
   */
  static from(options: RenownBuilderOptions): BaseRenownBuilder {
    const builder = new BaseRenownBuilder(options.appName);

    if (options.storage) {
      builder.withStorage(options.storage);
    }
    if (options.eventEmitter) {
      builder.withEventEmitter(options.eventEmitter);
    }
    if (options.crypto) {
      builder.withCrypto(options.crypto);
    }
    if (options.keyPairStorage) {
      builder.withKeyPairStorage(options.keyPairStorage);
    }
    if (options.baseUrl) {
      builder.withBaseUrl(options.baseUrl);
    }

    return builder;
  }
}
