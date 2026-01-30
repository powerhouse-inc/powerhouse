import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ILogger } from "../utils.js";
import type { JsonWebKeyPairStorage, JwkKeyPair } from "./types.js";

const ENV_KEY_NAME = "PH_RENOWN_PRIVATE_KEY";
const DEFAULT_KEYPAIR_PATH = join(process.cwd(), ".ph/.keypair.json");

/**
 * Key storage that supports:
 * 1. PH_RENOWN_PRIVATE_KEY environment variable (JSON-encoded JwkKeyPair)
 * 2. Custom file path passed via options
 * 3. Falls back to file storage at .ph/.keypair.json in current working directory
 */
export class NodeKeyStorage implements JsonWebKeyPairStorage {
  #filePath: string;
  #envKeyName: string;
  #logger?: ILogger;

  static readonly DEFAULT_KEYPAIR_PATH = DEFAULT_KEYPAIR_PATH;
  static readonly ENV_KEY_NAME = ENV_KEY_NAME;

  constructor(
    filePath?: string,
    options: { envKeyName?: string; logger?: ILogger } = {},
  ) {
    this.#filePath = filePath || DEFAULT_KEYPAIR_PATH;
    this.#envKeyName = options.envKeyName || ENV_KEY_NAME;
    this.#logger = options.logger;

    // Ensure directory exists
    const dir = dirname(this.#filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  loadKeyPair(): Promise<JwkKeyPair | undefined> {
    // First check environment variable
    const envKey = process.env[this.#envKeyName];
    if (envKey) {
      try {
        const keyPairJson = JSON.parse(envKey) as unknown;
        const keyPair: JwkKeyPair = this.#parseKeyPair(keyPairJson);

        // Validate it has the required structure
        this.#logger?.debug("Loaded keypair from environment variable");
        return Promise.resolve(keyPair);
      } catch (e) {
        throw new Error(
          `Failed to parse ${this.#envKeyName}: ${e instanceof Error ? e.message : String(e)}`,
          {
            cause: e,
          },
        );
      }
    }

    // Fall back to file storage
    return Promise.resolve(this.#loadFromFile());
  }

  async saveKeyPair(keyPair: JwkKeyPair): Promise<void> {
    // Don't save if using env var
    if (process.env[this.#envKeyName]) {
      return;
    }

    // Save to file
    this.#saveToFile(keyPair);
    return Promise.resolve();
  }

  removeKeyPair(): Promise<void> {
    if (process.env[this.#envKeyName]) {
      delete process.env[this.#envKeyName];
    }
    if (existsSync(this.#filePath)) {
      unlinkSync(this.#filePath);
    }
    return Promise.resolve();
  }

  #loadFromFile(): JwkKeyPair | undefined {
    try {
      if (!existsSync(this.#filePath)) {
        return undefined;
      }
      const data = readFileSync(this.#filePath, "utf-8");
      const parsed = JSON.parse(data) as unknown;
      const keyPair: JwkKeyPair = this.#parseKeyPair(parsed);
      this.#logger?.debug(`Loaded keypair from ${this.#filePath}`);
      return keyPair;
    } catch (e) {
      throw new Error(
        `Failed to parse ${this.#filePath}: ${e instanceof Error ? e.message : String(e)}`,
        {
          cause: e,
        },
      );
    }
  }

  #saveToFile(keyPair: JwkKeyPair): void {
    const data = { keyPair };
    writeFileSync(this.#filePath, JSON.stringify(data, null, 2), "utf-8");
    this.#logger?.debug(`Saved keypair to ${this.#filePath}`);
  }

  #parseKeyPair(json: unknown): JwkKeyPair {
    if (typeof json !== "object") {
      throw new Error("Invalid keyPair format:" + JSON.stringify(json));
    }

    const object = json as JwkKeyPair | { keyPair: JwkKeyPair };
    let keyPair: JwkKeyPair;
    if ("keyPair" in object) {
      keyPair = object.keyPair;
    } else {
      keyPair = object;
    }

    if ("publicKey" in keyPair && "privateKey" in keyPair) {
      return keyPair;
    } else {
      throw new Error("Invalid keyPair format:" + JSON.stringify(json));
    }
  }
}
