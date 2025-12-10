import {
  ConnectCrypto,
  type IConnectCrypto,
  type JsonWebKeyPairStorage,
  type JwkKeyPair,
} from "@renown/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { childLogger } from "document-drive";

const logger = childLogger(["switchboard", "connect-crypto"]);

const ENV_KEY_NAME = "PH_RENOWN_PRIVATE_KEY";
const DEFAULT_KEYPAIR_PATH = join(process.cwd(), ".keypair.json");

/**
 * Key storage that supports:
 * 1. PH_RENOWN_PRIVATE_KEY environment variable (JSON-encoded JwkKeyPair)
 * 2. Custom file path passed via options
 * 3. Falls back to file storage at .keypair.json in current working directory
 */
export class SwitchboardKeyStorage implements JsonWebKeyPairStorage {
  #filePath: string;

  constructor(filePath?: string) {
    this.#filePath = filePath || DEFAULT_KEYPAIR_PATH;

    // Ensure directory exists
    const dir = dirname(this.#filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async loadKeyPair(): Promise<JwkKeyPair | undefined> {
    // First check environment variable
    const envKey = process.env[ENV_KEY_NAME];
    if (envKey) {
      try {
        const keyPair = JSON.parse(envKey) as JwkKeyPair;
        // Validate it has the required structure
        if (keyPair.publicKey && keyPair.privateKey) {
          logger.debug("Loaded keypair from environment variable");
          return keyPair;
        }
        logger.warn(
          `${ENV_KEY_NAME} is set but doesn't contain valid publicKey and privateKey`,
        );
      } catch (e) {
        logger.warn(`Failed to parse ${ENV_KEY_NAME} as JSON:`, e);
      }
    }

    // Fall back to file storage
    return this.#loadFromFile();
  }

  async saveKeyPair(keyPair: JwkKeyPair): Promise<void> {
    // Don't save if using env var
    if (process.env[ENV_KEY_NAME]) {
      return;
    }

    // Save to file
    this.#saveToFile(keyPair);
  }

  #loadFromFile(): JwkKeyPair | undefined {
    try {
      if (!existsSync(this.#filePath)) {
        return undefined;
      }
      const data = readFileSync(this.#filePath, "utf-8");
      const parsed = JSON.parse(data) as Record<string, unknown>;
      const keyPair = parsed.keyPair as JwkKeyPair | undefined;
      if (keyPair) {
        logger.debug(`Loaded keypair from ${this.#filePath}`);
      }
      return keyPair;
    } catch {
      return undefined;
    }
  }

  #saveToFile(keyPair: JwkKeyPair): void {
    const data = { keyPair };
    writeFileSync(this.#filePath, JSON.stringify(data, null, 2), "utf-8");
    logger.debug(`Saved keypair to ${this.#filePath}`);
  }
}

// Singleton instance of ConnectCrypto for the switchboard
let connectCryptoInstance: IConnectCrypto | null = null;

export interface ConnectCryptoOptions {
  /** Path to the keypair file. Defaults to .keypair.json in cwd */
  keypairPath?: string;
  /** If true, won't generate a new keypair if none exists */
  requireExisting?: boolean;
}

/**
 * Initialize ConnectCrypto for the switchboard.
 * This allows the switchboard to authenticate with remote services
 * using the same identity established during `ph login`.
 */
export async function initConnectCrypto(
  options: ConnectCryptoOptions = {},
): Promise<IConnectCrypto | null> {
  const { keypairPath, requireExisting = false } = options;

  const keyStorage = new SwitchboardKeyStorage(keypairPath);

  // Check if we have an existing keypair
  const existingKeyPair = await keyStorage.loadKeyPair();

  if (!existingKeyPair && requireExisting) {
    logger.warn(
      "No existing keypair found and requireExisting is true. " +
        'Run "ph login" to create one.',
    );
    return null;
  }

  if (!existingKeyPair) {
    logger.info("No existing keypair found. A new one will be generated.");
  }

  connectCryptoInstance = new ConnectCrypto(keyStorage);

  const did = await connectCryptoInstance.did();
  logger.info(`Switchboard identity initialized: ${did}`);

  return connectCryptoInstance;
}

/**
 * Get the current ConnectCrypto instance.
 * Returns null if not initialized.
 */
export function getConnectCrypto(): IConnectCrypto | null {
  return connectCryptoInstance;
}

/**
 * Get the DID of the current ConnectCrypto instance.
 * Returns null if not initialized.
 */
export async function getConnectDid(): Promise<string | null> {
  if (!connectCryptoInstance) {
    return null;
  }
  return connectCryptoInstance.did();
}

/**
 * Get a bearer token for authenticating with remote services.
 * Returns null if ConnectCrypto is not initialized.
 */
export async function getBearerToken(
  driveUrl: string,
  address?: string,
  refresh = false,
): Promise<string | null> {
  if (!connectCryptoInstance) {
    return null;
  }
  return connectCryptoInstance.getBearerToken(driveUrl, address, refresh);
}
