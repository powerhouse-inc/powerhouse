import type { IRenown } from "@renown/sdk/node";

// Singleton instance of Renown
let renownInstance: IRenown | null = null;

/**
 * The Renown login in the home folder (`~/.ph/identities/renown`), the same
 * for every project. PH_RENOWN_PRIVATE_KEY still overrides its key.
 */
export async function getRenown(baseUrl?: string): Promise<IRenown> {
  if (!renownInstance) {
    const { homeLoginRenown } = await import("@renown/sdk/identity");
    renownInstance = await homeLoginRenown({
      appName: "ph-cli",
      ...(baseUrl ? { baseUrl } : {}),
    });
  }
  return renownInstance;
}
