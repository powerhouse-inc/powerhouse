import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ILogger } from "../utils.js";
import type { JsonWebKeyPairStorage, JwkKeyPair } from "./index.js";

const ENV_KEY_NAME = "PH_RENOWN_PRIVATE_KEY";
const DEFAULT_KEYPAIR_PATH = join(process.cwd(), ".keypair.json");

/**
 * Key storage that supports:
 * 1. PH_RENOWN_PRIVATE_KEY environment variable (JSON-encoded JwkKeyPair)
 * 2. Custom file path passed via options
 * 3. Falls back to file storage at .keypair.json in current working directory
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

  async loadKeyPair(): Promise<JwkKeyPair | undefined> {
    // First check environment variable
    const envKey = process.env[this.#envKeyName];
    if (envKey) {
      try {
        let keyPairJson = JSON.parse(envKey);
        let keyPair: JwkKeyPair =
          "keyPair" in keyPairJson ? keyPairJson.keyPair : keyPairJson;

        // Validate it has the required structure
        if (keyPair.publicKey && keyPair.privateKey) {
          this.#logger?.debug("Loaded keypair from environment variable");
          return keyPair;
        } else {
          throw new Error(
            `${this.#envKeyName} is set but doesn't contain valid publicKey and privateKey`,
          );
        }
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
    return this.#loadFromFile();
  }

  async saveKeyPair(keyPair: JwkKeyPair): Promise<void> {
    // Don't save if using env var
    if (process.env[this.#envKeyName]) {
      return;
    }

    // Save to file
    this.#saveToFile(keyPair);
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
      const parsed = JSON.parse(data);
      const keyPair =
        "keyPair" in parsed ? (parsed.keyPair as JwkKeyPair) : parsed;

      if (keyPair.publicKey && keyPair.privateKey) {
        this.#logger?.debug(`Loaded keypair from ${this.#filePath}`);
        return keyPair;
      } else {
        throw new Error(
          `${this.#filePath} doesn't contain valid publicKey and privateKey`,
        );
      }
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
}
