import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { JsonWebKeyPairStorage, JwkKeyPair } from "./index.js";

export class NodeKeyStorage implements JsonWebKeyPairStorage {
  static #DEFAULT_DIR = ".vetra";
  static #DEFAULT_FILE = "keypair.json";
  static #KEY = "keyPair";

  #filePath: string;

  constructor(filePath?: string) {
    if (filePath) {
      this.#filePath = filePath;
    } else {
      const homeDir = homedir();
      const defaultDir = join(homeDir, NodeKeyStorage.#DEFAULT_DIR);
      this.#filePath = join(defaultDir, NodeKeyStorage.#DEFAULT_FILE);
    }

    // Ensure directory exists
    const dir = dirname(this.#filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Initialize file if it doesn't exist
    if (!existsSync(this.#filePath)) {
      this.#writeData({});
    }
  }

  #readData(): Record<string, unknown> {
    try {
      const data = readFileSync(this.#filePath, "utf-8");
      return JSON.parse(data) as Record<string, unknown>;
    } catch (error) {
      // If file is corrupted or doesn't exist, return empty object
      return {};
    }
  }

  #writeData(data: Record<string, unknown>): void {
    try {
      writeFileSync(this.#filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      throw new Error(`Failed to write key pair data: ${error}`);
    }
  }

  async saveKeyPair(keyPair: JwkKeyPair): Promise<void> {
    try {
      const data = this.#readData();
      data[NodeKeyStorage.#KEY] = keyPair;
      this.#writeData(data);
    } catch (error) {
      throw new Error(`Failed to save key pair: ${error}`);
    }
  }

  async loadKeyPair(): Promise<JwkKeyPair | undefined> {
    try {
      const data = this.#readData();
      const keyPair = data[NodeKeyStorage.#KEY] as JwkKeyPair | undefined;
      return keyPair;
    } catch (error) {
      throw new Error(`Failed to load key pair: ${error}`);
    }
  }
}
