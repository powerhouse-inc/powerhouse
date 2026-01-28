import { RenownBuilder, type IRenown } from "@renown/sdk/node";
import { join } from "node:path";

const AUTH_FILE = ".ph/.renown.json";
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
// /**
//  * Load stored credentials from disk
//  */
// export function loadCredentials(): StoredCredentials | null {
//   try {
//     if (!existsSync(AUTH_PATH)) {
//       return null;
//     }
//     const content = readFileSync(AUTH_PATH, "utf-8");
//     return JSON.parse(content) as StoredCredentials;
//   } catch {
//     return null;
//   }
// }

// /**
//  * Save credentials to disk (in current working directory)
//  */
// export function saveCredentials(credentials: StoredCredentials): void {
//   writeFileSync(AUTH_PATH, JSON.stringify(credentials, null, 2), "utf-8");
// }

// /**
//  * Clear stored credentials
//  */
// export function clearCredentials(): boolean {
//   try {
//     if (existsSync(AUTH_PATH)) {
//       writeFileSync(AUTH_PATH, "{}", "utf-8");
//     }
//     return true;
//   } catch {
//     return false;
//   }
// }

// /**
//  * Check if user is currently authenticated
//  */
// export function isAuthenticated(): boolean {
//   const creds = loadCredentials();
//   return creds !== null && !!creds.credentialId;
// }

/**
 * Generate a UUID v4 for session IDs
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
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
