import { RenownBuilder, type IRenown } from "@renown/sdk/node";

// Singleton instance of Renown
let renownInstance: IRenown | null = null;

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
