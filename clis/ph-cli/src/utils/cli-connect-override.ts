// Builds a `connectOverride` partial from `ph connect build` CLI flags. This
// is the top of the precedence ladder for the runtime config emitted into
// `dist/powerhouse.config.json`:
//
//   DEFAULT_CONNECT_CONFIG  <  env-var seeds  <  source connect.*  <  --json  <  individual --flag
//
// `--json` parses as a partial `connect.*` blob and merges in first; then any
// individual --flag values merge on top, so a flag beats a conflicting --json
// value. The whole result is passed to the Vite plugin as `cliConnectOverride`
// and applied as the final deep-merge layer.

import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { deepMerge } from "@powerhousedao/shared/connect";
import type { ConnectBuildArgs } from "../types.js";

type PlainObject = Record<string, unknown>;

/**
 * Parse the `--json` payload (if any). Throws on malformed JSON or on a
 * non-object root with a clear, build-time-visible error.
 */
function parseJsonOverride(raw: string | undefined): PlainObject {
  if (raw === undefined || raw === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `ph connect build --json: invalid JSON (${msg}). Expected a partial 'connect.*' blob, e.g. --json '{"renown":{"url":"..."}}'.`,
      { cause: e },
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `ph connect build --json: payload must be a JSON object, got ${typeof parsed}.`,
    );
  }
  return parsed as PlainObject;
}

function setIfDefined<V>(
  target: PlainObject,
  key: string,
  value: V | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

/**
 * Build the override partial from individual CLI flags. Only includes paths
 * the user explicitly set (undefined = unset, exclude).
 */
function buildFlagOverride(args: ConnectBuildArgs): PlainObject {
  const out: PlainObject = {};

  const renown: PlainObject = {};
  setIfDefined(renown, "url", args.renownUrl);
  setIfDefined(renown, "networkId", args.renownNetworkId);
  setIfDefined(renown, "chainId", args.renownChainId);
  if (Object.keys(renown).length > 0) out.renown = renown;

  const packages: PlainObject = {};
  setIfDefined(packages, "externalEnabled", args.externalPackages);
  if (Object.keys(packages).length > 0) out.packages = packages;

  const drives: PlainObject = {};
  setIfDefined(drives, "allowAddDrive", args.allowAddDrive);

  const remote: PlainObject = {};
  setIfDefined(remote, "enabled", args.remoteDrivesEnabled);
  setIfDefined(remote, "allowAdd", args.remoteDrivesAllowAdd);
  setIfDefined(remote, "allowDelete", args.remoteDrivesAllowDelete);

  const local: PlainObject = {};
  setIfDefined(local, "enabled", args.localDrivesEnabled);
  setIfDefined(local, "allowAdd", args.localDrivesAllowAdd);
  setIfDefined(local, "allowDelete", args.localDrivesAllowDelete);

  const sections: PlainObject = {};
  if (Object.keys(remote).length > 0) sections.remote = remote;
  if (Object.keys(local).length > 0) sections.local = local;
  if (Object.keys(sections).length > 0) drives.sections = sections;
  if (Object.keys(drives).length > 0) out.drives = drives;

  return out;
}

/**
 * Combine `--json` and the individual flag values into a single connect
 * override. Returns undefined when neither was provided so the Vite plugin
 * can skip the final merge layer entirely.
 */
export function buildCliConnectOverride(
  args: ConnectBuildArgs,
): PHConnectRuntimeConfig | undefined {
  const fromJson = parseJsonOverride(args.json);
  const fromFlags = buildFlagOverride(args);
  const hasJson = Object.keys(fromJson).length > 0;
  const hasFlags = Object.keys(fromFlags).length > 0;
  if (!hasJson && !hasFlags) return undefined;
  // Individual flags merge on top of --json so a flag beats a colliding json value.
  return deepMerge(
    fromJson as PHConnectRuntimeConfig,
    fromFlags as PHConnectRuntimeConfig,
  );
}
