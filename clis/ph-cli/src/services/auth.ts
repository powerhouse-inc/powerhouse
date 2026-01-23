import {
  ConnectCrypto,
  type IConnectCrypto,
  type JwkKeyPair,
} from "@renown/sdk";
import { NodeKeyStorage } from "@renown/sdk/node";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
export const DEFAULT_RENOWN_URL = "https://www.renown.id" as const;

/**
 * Get or create the ConnectCrypto instance
 * Uses PH_RENOWN_PRIVATE_KEY env var if set, otherwise generates/loads from file
 */
export async function getConnectCrypto(): Promise<IConnectCrypto> {
  if (!connectCryptoInstance) {
    const keyStorage = new NodeKeyStorage();
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
