import type { Renown } from "./common.js";
import { NodeKeyStorage } from "./crypto/node-key-storage.js";
import { NodeEventEmitter } from "./event/event.node.js";
import { BaseRenownBuilder } from "./renown-builder.js";
import { NodeStorage } from "./storage/storage.node.js";
import type { RenownEvents, RenownStorageMap } from "./types.js";

export class NodeRenownEventEmitter extends NodeEventEmitter<RenownEvents> {}
export class NodeRenownStorage extends NodeStorage<RenownStorageMap> {}

export const DEFAULT_RENOWN_STORAGE_PATH = "./.ph/.renown.json";

export interface NodeRenownBuilderOptions {
  /** File path for user storage. Defaults to ".ph/.renown.json" in cwd */
  storagePath?: string;
  /** File path for keypair storage. Defaults to ".ph/.keypair.json" in cwd */
  keyPath?: string;
  /** Renown server URL. Defaults to https://www.renown.id */
  baseUrl?: string;
  /** Switchboard GraphQL endpoint for the direct-to-reactor flow. */
  switchboardUrl?: string;
  /** Re-check a stored credential on build (default "always"). */
  revalidate?: "always" | "never";
}

/** Node.js Renown builder: file-based user + key storage. */
export class RenownBuilder extends BaseRenownBuilder {
  #revalidate: "always" | "never";

  constructor(appName: string, options: NodeRenownBuilderOptions = {}) {
    super(appName);

    const {
      storagePath = DEFAULT_RENOWN_STORAGE_PATH,
      keyPath,
      baseUrl,
      switchboardUrl,
      revalidate = "always",
    } = options;

    this.#revalidate = revalidate;
    this.withKeyPairStorage(new NodeKeyStorage(keyPath));
    this.withStorage(new NodeRenownStorage(storagePath));
    this.withEventEmitter(new NodeRenownEventEmitter());
    if (baseUrl) {
      this.withBaseUrl(baseUrl);
    }
    if (switchboardUrl) {
      this.withSwitchboardUrl(switchboardUrl);
    }
  }

  // Node scripts/CLI act on auth state once and exit, so revalidation must
  // finish before build() resolves — block on it (unlike the browser builder).
  async build(): Promise<Renown> {
    const renown = await super.build();
    if (this.#revalidate === "always" && renown.user) {
      await renown.revalidate();
    }
    return renown;
  }
}
