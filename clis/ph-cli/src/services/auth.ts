import {
  ConnectCrypto,
  type IConnectCrypto,
  type JsonWebKeyPairStorage,
  type JwkKeyPair,
} from "@renown/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ENV_KEY_NAME = "PH_RENOWN_PRIVATE_KEY";
const AUTH_FILE = ".auth.json";
const KEYPAIR_FILE = ".keypair.json";
const AUTH_PATH = join(process.cwd(), AUTH_FILE);
const KEYPAIR_PATH = join(process.cwd(), KEYPAIR_FILE);

// Singleton instance of ConnectCrypto
let connectCryptoInstance: IConnectCrypto | null = null;

export interface StoredCredentials {
  address: string;
  chainId: number;
  did: string;
  connectDid: string; // The DID of the ConnectCrypto instance (did:key:...)
  credentialId: string;
  userDocumentId?: string;
  authenticatedAt: string;
  renownUrl: string;
}

/**
 * Key storage that supports:
 * 1. PH_RENOWN_PRIVATE_KEY environment variable (JSON-encoded JwkKeyPair)
 * 2. Falls back to file storage at .keypair.json in current working directory
 */
export class KeyStorage implements JsonWebKeyPairStorage {
  #filePath: string;

  constructor(filePath?: string) {
    this.#filePath = filePath || KEYPAIR_PATH;

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
          return keyPair;
        }
        console.warn(
          `${ENV_KEY_NAME} is set but doesn't contain valid publicKey and privateKey`,
        );
      } catch (e) {
        console.warn(`Failed to parse ${ENV_KEY_NAME} as JSON:`, e);
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
      return parsed.keyPair as JwkKeyPair | undefined;
    } catch {
      return undefined;
    }
  }

  #saveToFile(keyPair: JwkKeyPair): void {
    const data = { keyPair };
    writeFileSync(this.#filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}

/**
 * Load stored credentials from disk
 */
export function loadCredentials(): StoredCredentials | null {
  try {
    if (!existsSync(AUTH_PATH)) {
      return null;
    }
    const content = readFileSync(AUTH_PATH, "utf-8");
    return JSON.parse(content) as StoredCredentials;
  } catch {
    return null;
  }
}

/**
 * Save credentials to disk (in current working directory)
 */
export function saveCredentials(credentials: StoredCredentials): void {
  writeFileSync(AUTH_PATH, JSON.stringify(credentials, null, 2), "utf-8");
}

/**
 * Clear stored credentials
 */
export function clearCredentials(): boolean {
  try {
    if (existsSync(AUTH_PATH)) {
      writeFileSync(AUTH_PATH, "{}", "utf-8");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user is currently authenticated
 */
export function isAuthenticated(): boolean {
  const creds = loadCredentials();
  return creds !== null && !!creds.credentialId;
}

/**
 * Generate a UUID v4 for session IDs
 */
export function generateSessionId(): string {
  // Simple UUID v4 implementation using crypto
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Default Renown URL
 */
export const DEFAULT_RENOWN_URL = "https://www.renown.id";

/**
 * Get or create the ConnectCrypto instance
 * Uses PH_RENOWN_PRIVATE_KEY env var if set, otherwise generates/loads from file
 */
export async function getConnectCrypto(): Promise<IConnectCrypto> {
  if (!connectCryptoInstance) {
    const keyStorage = new KeyStorage();
    connectCryptoInstance = new ConnectCrypto(keyStorage);
  }
  return connectCryptoInstance;
}

/**
 * Get the DID from ConnectCrypto
 * This is the did:key:... format DID that identifies this CLI instance
 */
export async function getConnectDid(): Promise<string> {
  const crypto = await getConnectCrypto();
  return crypto.did();
}

/**
 * Get the issuer for signing credentials
 */
export async function getIssuer() {
  const crypto = await getConnectCrypto();
  return crypto.getIssuer();
}

/**
 * Get a bearer token for API authentication
 */
export async function getBearerToken(
  driveUrl: string,
  address?: string,
  refresh = false,
): Promise<string> {
  const crypto = await getConnectCrypto();
  return crypto.getBearerToken(driveUrl, address, refresh);
}

/**
 * Export the keypair to a JSON string suitable for PH_RENOWN_PRIVATE_KEY
 */
export function exportKeyPairToEnv(keyPair: JwkKeyPair): string {
  return JSON.stringify(keyPair);
}
