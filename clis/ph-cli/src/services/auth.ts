import { RenownBuilder, type IRenown, type JwkKeyPair } from "@renown/sdk/node";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AUTH_FILE = ".auth.json";
const AUTH_PATH = join(process.cwd(), AUTH_FILE);

// Singleton instance of Renown
let renownInstance: IRenown | null = null;

export interface StoredCredentials {
  address: string;
  chainId: number;
  userDid: string;
  appDid: string;
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
 * Get or create the Renown instance
 * Uses PH_RENOWN_PRIVATE_KEY env var if set, otherwise generates/loads from file
 */
export async function getRenown(): Promise<IRenown> {
  if (!renownInstance) {
    renownInstance = await new RenownBuilder("ph-cli").build();
  }
  return renownInstance;
}

/**
 * Export the keypair to a JSON string suitable for PH_RENOWN_PRIVATE_KEY
 */
export function exportKeyPairToEnv(keyPair: JwkKeyPair): string {
  return JSON.stringify(keyPair);
}
