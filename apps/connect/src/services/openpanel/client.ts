import type { OpenPanel } from "@openpanel/web";

import { clearOpenPanelBuffer, drainOpenPanelBuffer } from "./buffer.js";
import type { OpenPanelConfig } from "./types.js";

let client: OpenPanel | undefined;

/**
 * Returns the cached `OpenPanel` singleton, building it on first call.
 *
 * When `config.clientId` is empty it returns `undefined` without importing
 * `@openpanel/web`, so the bundler can tree-shake the SDK out of production.
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

  // Dynamic import keeps @openpanel/web out of the initial chunk.
  const { OpenPanel: OpenPanelClass } = await import("@openpanel/web");

  client = new OpenPanelClass({
    clientId: config.clientId,
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    // Parity with Renown/Vetra (`<OpenPanelComponent trackScreenViews
    // trackOutgoingLinks />`): automatic pageviews on history changes and
    // outgoing-link clicks. Not env-gated — the clientId kill switch and the
    // cookie-consent gate remain the on/off controls.
    trackScreenViews: true,
    trackOutgoingLinks: true,
  });

  // Stamp every event (including the constructor's deferred initial
  // screen_view) with the app segmentation property — mirrors Renown/Vetra's
  // `globalProperties={{ app }}`. The web SDK has no constructor option for
  // this, so it is set imperatively right after construction.
  client.setGlobalProperties({ app: "connect" });

  // Runs once (the `if (client)` guard above), so the buffer is never
  // double-drained.
  drainOpenPanelBuffer(client);

  return client;
}

/**
 * Clears the cached singleton and the pre-init buffer. Call on consent
 * revocation or during tests; buffered events are discarded, not replayed.
 */
export function resetOpenPanelClient(): void {
  client = undefined;
  clearOpenPanelBuffer();
}
