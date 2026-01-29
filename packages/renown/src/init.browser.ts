import type { Renown } from "./common.js";
import { BrowserKeyStorage } from "./crypto/browser-key-storage.js";
import { BrowserEventEmitter } from "./event/event.browser.js";
import { BaseRenownBuilder } from "./renown-builder.js";
import { BrowserStorage } from "./storage/storage.browser.js";
import type { RenownEvents, RenownStorageMap } from "./types.js";

export class BrowserRenownStorage extends BrowserStorage<RenownStorageMap> {}
export class BrowserRenownEventEmitter extends BrowserEventEmitter<RenownEvents> {}

export interface BrowserRenownBuilderOptions {
  /** Base path for storage keys (e.g., "/app" for multi-tenant apps) */
  basename?: string;
  /** Renown server URL. Defaults to https://www.renown.id */
  baseUrl?: string;
  /** IndexedDB database name for key storage. Defaults to "renownKeyDB" */
  keyDbName?: string;
}

/**
 * Browser-specific Renown builder with pre-configured defaults.
 * Uses localStorage for user data and IndexedDB for key storage.
 */
export class RenownBuilder extends BaseRenownBuilder {
  #basename?: string;
  #keyDbName?: string;

  /**
   * @param appName - Application name used for signing context
   * @param options - Browser-specific configuration options
   */
  constructor(appName: string, options: BrowserRenownBuilderOptions = {}) {
    super(appName);
    this.#basename = options.basename;
    this.#keyDbName = options.keyDbName;
    this.withStorage(new BrowserRenownStorage("renown", this.#basename));
    this.withEventEmitter(new BrowserRenownEventEmitter());
    if (options.baseUrl) {
      this.withBaseUrl(options.baseUrl);
    }
  }

  /**
   * Set base path for storage keys (e.g., "/app" for multi-tenant apps).
   */
  withBasename(basename: string): this {
    this.#basename = basename;
    this.withStorage(new BrowserRenownStorage("renown", this.#basename));
    return this;
  }

  /**
   * Set IndexedDB database name for key storage.
   * Defaults to "renownKeyDB".
   */
  withKeyDbName(keyDbName: string): this {
    this.#keyDbName = keyDbName;
    return this;
  }

  /**
   * Build and initialize the Renown instance.
   * Initializes IndexedDB for key storage before building.
   */
  async build(): Promise<Renown> {
    const keyStorage = await BrowserKeyStorage.create(this.#keyDbName);
    this.withKeyPairStorage(keyStorage);
    return super.build();
  }
}

/**
 * @deprecated Use RenownBuilder directly instead.
 * Initialize a browser-specific Renown instance.
 * @param appName - Application name used for signing context
 * @param options - Browser-specific configuration options
 * @returns Initialized Renown instance
 */
export function initRenown(
  appName: string,
  options: BrowserRenownBuilderOptions = {},
) {
  return new RenownBuilder(appName, options).build();
}
