// Type-only import — does not pull the runtime SDK into the bundle.
import type { OpenPanel } from "@openpanel/web";

import type { OpenPanelConfig } from "./types.js";

let client: OpenPanel | undefined;

/**
 * Returns the cached `OpenPanel` singleton, building it on first call.
 *
 * If `config.clientId` is empty the function returns `undefined` **without**
 * importing `@openpanel/web`, allowing the bundler to tree-shake the SDK out
 * of the production bundle entirely.
 */
export async function getOpenPanelClient(
  config: OpenPanelConfig,
): Promise<OpenPanel | undefined> {
  if (!config.clientId) {
    return undefined;
  }

  if (client) {
    return client;
  }

  // Dynamic import is intentional: keeps @openpanel/web out of the initial
  // chunk and enables tree-shaking when clientId is absent.
  const { OpenPanel: OpenPanelClass } = await import("@openpanel/web");

  client = new OpenPanelClass({
    clientId: config.clientId,
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
  });

  return client;
}

/**
 * Clears the cached singleton so the next `getOpenPanelClient()` call builds
 * a fresh instance.  Call this on consent revocation or during tests.
 */
export function resetOpenPanelClient(): void {
  client = undefined;
}
