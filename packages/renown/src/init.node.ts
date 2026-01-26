import { NodeKeyStorage } from "./crypto/node-key-storage.js";
import { NodeEventEmitter } from "./event/event.node.js";
import { BaseRenownBuilder } from "./renown-builder.js";
import { NodeStorage } from "./storage/storage.node.js";
import type { RenownEvents, RenownStorageMap } from "./types.js";

export class NodeRenownEventEmitter extends NodeEventEmitter<RenownEvents> {}
export class NodeRenownStorage extends NodeStorage<RenownStorageMap> {}

export interface NodeRenownBuilderOptions {
  /** File path for user storage. Defaults to "./.renown.json" */
  storagePath?: string;
  /** File path for keypair storage. Defaults to "./.keypair.json" */
  keyPath?: string;
  /** Renown server URL. Defaults to https://www.renown.id */
  baseUrl?: string;
}

/**
 * Node.js-specific Renown builder with pre-configured defaults.
 * Uses file-based storage for both user data and key storage.
 */
export class RenownBuilder extends BaseRenownBuilder {
  /**
   * @param appName - Application name used for signing context
   * @param options - Node.js-specific configuration options
   */
  constructor(appName: string, options: NodeRenownBuilderOptions = {}) {
    super(appName);

    const { storagePath = "./.renown.json", keyPath, baseUrl } = options;

    this.withKeyPairStorage(new NodeKeyStorage(keyPath));
    this.withStorage(new NodeRenownStorage(storagePath));
    this.withEventEmitter(new NodeRenownEventEmitter());
    if (baseUrl) {
      this.withBaseUrl(baseUrl);
    }
  }
}
