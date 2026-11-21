import type { PHConnectCompositionEntry } from "@powerhousedao/shared/clis";
import { getRuntimeConfig } from "../runtime/runtime-config.js";

/**
 * Plugin-presence reads for the UI (rewire R3, step toward generic-shell
 * deletability). The runtime config carries `connect.composition`: the list
 * of plugins the host declared, or the default one `loadRuntimeConfig` works
 * out for a config served without. UI can gate on a plugin being present
 * ("presence is activation").
 *
 * A plugin absent from the composition is not active, and with no composition
 * in the config no plugin is.
 */
export function getActivePluginModules(): ReadonlySet<string> {
  try {
    const composition = getRuntimeConfig().connect?.composition as
      | PHConnectCompositionEntry[]
      | undefined;
    return new Set((composition ?? []).map((entry) => entry.module));
  } catch {
    // Config cache not warm (shouldn't happen post-boot): no plugin is active.
    return new Set();
  }
}

export function isPluginActive(module: string): boolean {
  return getActivePluginModules().has(module);
}
