import type { PHConnectCompositionEntry } from "@powerhousedao/shared/clis";
import { getRuntimeConfig } from "../runtime-config.js";

/**
 * Plugin-presence reads for the UI (rewire R3, step toward generic-shell
 * deletability). The served runtime config carries `connect.composition` — the
 * list of plugins the host declared — when uniform runners project it. UI can
 * gate on a plugin being present ("presence is activation").
 *
 * Classic semantics are preserved: when there is NO declared composition
 * (flag-off, or a host without a plugins list), `null` is returned and every
 * plugin is treated as active — so the classic chrome renders exactly as
 * before. Gating only hides something when a composition IS declared and the
 * plugin is absent from it.
 */
export function getActivePluginModules(): ReadonlySet<string> | null {
  try {
    const composition = getRuntimeConfig().connect?.composition as
      | PHConnectCompositionEntry[]
      | undefined;
    if (!composition) return null;
    return new Set(composition.map((entry) => entry.module));
  } catch {
    // Config cache not warm (shouldn't happen post-boot) — fail open to classic.
    return null;
  }
}

export function isPluginActive(module: string): boolean {
  const active = getActivePluginModules();
  return active === null ? true : active.has(module);
}

/** Hook form; the composition is fixed for the page's lifetime, so this is a
 * plain synchronous read (no subscription needed). */
export function useIsPluginActive(module: string): boolean {
  return isPluginActive(module);
}
