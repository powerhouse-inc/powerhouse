// Merging of Connect PWA override fragments.
//
// PWA config comes from several layers — Connect's hardcoded defaults, each
// build-time-known package's `pwa` fragment, and the project's `connect.pwa`
// block. A naive deep-merge is wrong here: runtime-caching rules and precache
// globs are ADDITIVE (a later layer must not drop an earlier layer's offline
// coverage), and the precache size ceiling must be the MAX so no contributor
// can silently shrink another's limit. This module encodes those per-field
// strategies: `mergePwaConfig(contributions)` folds an ordered list of
// serialisable `PHConnectPwa` fragments (lowest precedence first) into one
// effective fragment, warning when multiple packages set the same manifest
// scalar to different values.
//
// Laying the effective fragment over Connect's hardcoded VitePWA base happens
// in builder-tools (`connect-utils/vite-plugins/pwa-overrides.ts`), where the
// real vite-plugin-pwa/Workbox types are available.

import type {
  PHConnectPwa,
  PHConnectPwaManifest,
  PHConnectPwaUrlPattern,
} from "../clis/types.js";
import { deepMerge } from "./config-loader.js";

// Re-exported so the PWA override types are reachable from the same
// `@powerhousedao/shared/connect` entry as the merge helpers that consume them.
export type {
  PHConnectPwa,
  PHConnectPwaCacheStrategy,
  PHConnectPwaFileHandler,
  PHConnectPwaIcon,
  PHConnectPwaManifest,
  PHConnectPwaRuntimeCaching,
  PHConnectPwaUrlPattern,
} from "../clis/types.js";

/** A labelled PWA fragment, so merge diagnostics can name the contributor. */
export type PwaContribution = {
  /** Human-readable origin (package name, or the project config file). */
  source: string;
  config: PHConnectPwa;
};

// Manifest scalar fields — the ones where "two layers set it" is a genuine
// conflict (as opposed to the additive arrays, which never conflict).
const MANIFEST_SCALAR_KEYS: readonly (keyof PHConnectPwaManifest)[] = [
  "name",
  "short_name",
  "description",
  "theme_color",
  "background_color",
  "display",
  "start_url",
  "scope",
  "launch_handler",
];

// Structural icon shape shared by PHConnectPwaIcon and vite-plugin-pwa's
// IconResource (whose `purpose` may also be an array of purposes).
type IconLike = {
  src: string;
  sizes?: string;
  purpose?: string | readonly string[];
};

function iconKey(icon: IconLike): string {
  const purpose =
    typeof icon.purpose === "string"
      ? icon.purpose
      : (icon.purpose?.join(",") ?? "");
  return `${icon.src}|${icon.sizes ?? ""}|${purpose}`;
}

/** Concatenate icons, keeping the first occurrence of each (src,sizes,purpose). */
export function dedupeIcons<T extends IconLike>(icons: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const icon of icons) {
    const key = iconKey(icon);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(icon);
  }
  return result;
}

/** `JSON.stringify` with object keys sorted recursively, so two structurally
 * equal values always serialise identically (accept-map key order etc.). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Concatenate file handlers, keeping the first occurrence of each entry.
 * Deduped on the WHOLE entry (canonical JSON) rather than any single field:
 * every handler shares Connect's fixed action, and two handlers accepting
 * different file types are both real contributions — only the exact same
 * fragment arriving via two layers is a duplicate. Structural, so it also
 * works on the vite-plugin-pwa handler shape in builder-tools.
 */
export function dedupeFileHandlers<T extends object>(handlers: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const handler of handlers) {
    const key = stableStringify(handler);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(handler);
  }
  return result;
}

/** Order-preserving string union (used for the precache glob lists). */
export function unionStrings(
  base: string[] | undefined,
  extra: string[],
): string[] {
  const result = [...(base ?? [])];
  for (const item of extra) if (!result.includes(item)) result.push(item);
  return result;
}

function patternKey(pattern: PHConnectPwaUrlPattern): string {
  return typeof pattern === "string"
    ? `s:${pattern}`
    : `r:${pattern.source}:${pattern.flags ?? ""}`;
}

function unionPatterns(
  base: PHConnectPwaUrlPattern[] | undefined,
  extra: PHConnectPwaUrlPattern[],
): PHConnectPwaUrlPattern[] {
  const result = [...(base ?? [])];
  const seen = new Set(result.map(patternKey));
  for (const pattern of extra) {
    const key = patternKey(pattern);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pattern);
  }
  return result;
}

/** Merge one fragment into `target` in place, applying the per-field
 * strategies (manifest scalars deep-merge and win; icons/file_handlers/globs/
 * rules/denylist are additive; size ceiling takes the max). */
function mergeInto(target: PHConnectPwa, config: PHConnectPwa): void {
  if (config.manifest) {
    // The array fields must stay out of the deepMerge path — deepMerge
    // replaces arrays wholesale, which would drop earlier contributions.
    const { icons, file_handlers, ...scalars } = config.manifest;
    if (Object.keys(scalars).length > 0) {
      target.manifest = deepMerge(
        target.manifest ?? {},
        scalars as PHConnectPwaManifest,
      );
    }
    if (icons?.length) {
      target.manifest = {
        ...(target.manifest ?? {}),
        icons: dedupeIcons([...(target.manifest?.icons ?? []), ...icons]),
      };
    }
    if (file_handlers?.length) {
      target.manifest = {
        ...(target.manifest ?? {}),
        file_handlers: dedupeFileHandlers([
          ...(target.manifest?.file_handlers ?? []),
          ...file_handlers,
        ]),
      };
    }
  }
  if (config.globPatterns?.length) {
    target.globPatterns = unionStrings(
      target.globPatterns,
      config.globPatterns,
    );
  }
  if (config.globIgnores?.length) {
    target.globIgnores = unionStrings(target.globIgnores, config.globIgnores);
  }
  if (config.runtimeCaching?.length) {
    target.runtimeCaching = [
      ...(target.runtimeCaching ?? []),
      ...config.runtimeCaching,
    ];
  }
  if (config.navigateFallbackDenylist?.length) {
    target.navigateFallbackDenylist = unionPatterns(
      target.navigateFallbackDenylist,
      config.navigateFallbackDenylist,
    );
  }
  if (typeof config.maximumFileSizeToCacheInBytes === "number") {
    target.maximumFileSizeToCacheInBytes = Math.max(
      target.maximumFileSizeToCacheInBytes ?? 0,
      config.maximumFileSizeToCacheInBytes,
    );
  }
}

/**
 * Fold the build-time-known package PWA fragments and the project's
 * `connect.pwa` block into one effective fragment. Precedence is
 * `packageContributions (in order) < projectConfig` — the project config wins
 * scalar fields, while arrays (`icons`, globs, `runtimeCaching`,
 * `navigateFallbackDenylist`) are additive across every layer and the size
 * ceiling takes the max.
 *
 * `onWarn` fires when two or more PACKAGES set the same manifest scalar to
 * different values and the project config doesn't settle it — the winner is
 * otherwise decided silently by package load order. The operator resolves it
 * by setting that field in `connect.pwa`, which both wins and silences the
 * warning.
 */
export function mergePwaConfig(
  packageContributions: PwaContribution[],
  projectConfig?: PHConnectPwa,
  onWarn: (message: string) => void = () => {},
): PHConnectPwa {
  const merged: PHConnectPwa = {};
  // Which packages set each manifest scalar, and to what (for the conflict
  // warning). The project config is deliberately excluded — it is the
  // authority, not a conflicting sibling.
  const packageScalarSetters: Partial<
    Record<string, { source: string; value: unknown }[]>
  > = {};

  for (const { source, config } of packageContributions) {
    mergeInto(merged, config);
    for (const [key, value] of Object.entries(config.manifest ?? {})) {
      if (key === "icons" || key === "file_handlers") continue;
      (packageScalarSetters[key] ??= []).push({ source, value });
    }
  }
  if (projectConfig) mergeInto(merged, projectConfig);

  const projectManifest = projectConfig?.manifest ?? {};
  for (const key of MANIFEST_SCALAR_KEYS) {
    const setters = packageScalarSetters[key];
    const projectSettles = projectManifest[key] !== undefined;
    if (!setters || setters.length < 2 || projectSettles) continue;
    // Same value from every package is agreement, not a conflict. Compared
    // via stableStringify, not by identity — launch_handler is object-valued,
    // and two packages sending equal objects (in any key order) must not read
    // as a conflict.
    const distinctValues = new Set(setters.map((s) => stableStringify(s.value)));
    if (distinctValues.size < 2) continue;
    const sources = setters.map((s) => s.source);
    onWarn(
      `PWA config: manifest.${key} set by multiple packages (${sources.join(
        ", ",
      )}); '${sources[sources.length - 1]}' wins by load order. Set connect.pwa.manifest.${key} in the project config to make the winner explicit.`,
    );
  }

  return merged;
}

/** A serialisable URL pattern as Workbox consumes it: strings pass through
 * verbatim, `{ source, flags }` is rebuilt into a RegExp. */
export function toRegExpOrString(
  pattern: PHConnectPwaUrlPattern,
): string | RegExp {
  return typeof pattern === "string"
    ? pattern
    : new RegExp(pattern.source, pattern.flags);
}
