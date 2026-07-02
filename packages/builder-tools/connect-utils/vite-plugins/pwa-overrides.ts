import {
  dedupeIcons,
  deepMerge,
  toRegExpOrString,
  unionStrings,
  type PHConnectPwa,
  type PHConnectPwaRuntimeCaching,
  type PHConnectPwaUrlPattern,
} from "@powerhousedao/shared/connect";
import type { ManifestOptions, VitePWAOptions } from "vite-plugin-pwa";
import { escapeForRegExp } from "./dynamic-base.js";

// Applies the effective (already merged, see mergePwaConfig) serialisable PWA
// fragment onto Connect's hardcoded VitePWA base. Lives here rather than in
// @powerhousedao/shared so the base and result can use vite-plugin-pwa's own
// option types — shared deliberately has no dependency on the PWA toolchain.

/** The web-app manifest exactly as VitePWA accepts it. */
export type ConnectPwaManifest = Partial<ManifestOptions>;
/** Workbox `generateSW` options exactly as VitePWA accepts them. */
export type ConnectWorkboxOptions = NonNullable<VitePWAOptions["workbox"]>;

type WorkboxRuntimeCaching = NonNullable<
  ConnectWorkboxOptions["runtimeCaching"]
>[number];

function toWorkboxRule(
  rule: PHConnectPwaRuntimeCaching,
): WorkboxRuntimeCaching {
  return {
    urlPattern: toRegExpOrString(rule.urlPattern),
    handler: rule.handler,
    ...(rule.method ? { method: rule.method } : {}),
    ...(rule.options ? { options: rule.options } : {}),
  };
}

/** Workbox's navigateFallbackDenylist only accepts RegExps (unlike
 * runtimeCaching, where a string is a valid exact-URL matcher), so a plain
 * string pattern is escaped and matched as a literal substring of the URL. */
function toDenylistRegExp(pattern: PHConnectPwaUrlPattern): RegExp {
  const value = toRegExpOrString(pattern);
  return typeof value === "string" ? new RegExp(escapeForRegExp(value)) : value;
}

/**
 * Lay an effective PWA fragment over the plugin's hardcoded manifest + Workbox
 * base. Manifest scalars deep-merge (override wins); icons concatenate after
 * the base set; globs union; the size ceiling takes the max; runtime-caching
 * rules and denylist patterns are appended AFTER the built-ins (Workbox is
 * first-match-wins, so an override cannot shadow a built-in rule for the same
 * URL — that is intentional for v1).
 */
export function applyPwaOverrides(
  base: { manifest: ConnectPwaManifest; workbox: ConnectWorkboxOptions },
  override: PHConnectPwa,
): { manifest: ConnectPwaManifest; workbox: ConnectWorkboxOptions } {
  const { icons: overrideIcons, ...manifestScalars } = override.manifest ?? {};
  let manifest: ConnectPwaManifest = deepMerge(base.manifest, manifestScalars);
  if (overrideIcons?.length) {
    manifest = {
      ...manifest,
      icons: dedupeIcons([...(base.manifest.icons ?? []), ...overrideIcons]),
    };
  }

  const workbox: ConnectWorkboxOptions = { ...base.workbox };
  if (override.globPatterns?.length) {
    workbox.globPatterns = unionStrings(
      workbox.globPatterns,
      override.globPatterns,
    );
  }
  if (override.globIgnores?.length) {
    workbox.globIgnores = unionStrings(
      workbox.globIgnores,
      override.globIgnores,
    );
  }
  if (typeof override.maximumFileSizeToCacheInBytes === "number") {
    workbox.maximumFileSizeToCacheInBytes = Math.max(
      workbox.maximumFileSizeToCacheInBytes ?? 0,
      override.maximumFileSizeToCacheInBytes,
    );
  }
  if (override.runtimeCaching?.length) {
    workbox.runtimeCaching = [
      ...(workbox.runtimeCaching ?? []),
      ...override.runtimeCaching.map(toWorkboxRule),
    ];
  }
  if (override.navigateFallbackDenylist?.length) {
    workbox.navigateFallbackDenylist = [
      ...(workbox.navigateFallbackDenylist ?? []),
      ...override.navigateFallbackDenylist.map(toDenylistRegExp),
    ];
  }

  return { manifest, workbox };
}
