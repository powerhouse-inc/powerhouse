// Type-only import — does not pull the runtime SDK into the bundle.
import type { OpenPanel } from "@openpanel/web";

import {
  clearOpenPanelBuffer,
  drainOpenPanelBuffer,
} from "./buffer.js";
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

  // Drain any events that were buffered before the client was ready.
  // This runs exactly once (the early `if (client) return client` guards
  // subsequent calls), so the buffer is never double-drained.
  drainOpenPanelBuffer(client);

  return client;
}

/**
 * Clears the cached singleton so the next `getOpenPanelClient()` call builds
 * a fresh instance.  Call this on consent revocation or during tests.
 *
 * Also clears the pre-init buffer so that events queued before the client was
 * ready are discarded — they must not be replayed after consent is revoked.
 */
export function resetOpenPanelClient(): void {
  client = undefined;
  clearOpenPanelBuffer();
}
