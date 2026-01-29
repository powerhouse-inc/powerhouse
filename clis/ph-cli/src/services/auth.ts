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
