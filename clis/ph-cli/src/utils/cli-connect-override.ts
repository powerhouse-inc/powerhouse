// Builds a `connectOverride` partial from CLI flags. Shared by:
//
//   - `ph connect build` — uses `buildCliConnectOverride` to produce the
//     `cliConnectOverride` patch the Vite plugin applies at the top of the
//     precedence ladder:
//
//       DEFAULT_CONNECT_CONFIG  <  env-var seeds  <  source connect.*  <  --json  <  individual --flag
//
//   - `ph connect config` — uses `buildConnectFlagPatch` (the per-field
//     partial builder) to translate flag-set values into the patch that
//     gets dual-written to source + dist `powerhouse.config.json`.
//
// `--json` parses as a partial `connect.*` blob and merges in first; then any
// individual --flag values merge on top, so a flag beats a conflicting --json
// value.

import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { deepMerge } from "@powerhousedao/shared/connect";
import type { ConnectBuildArgs, ConnectStudioArgs } from "../types.js";
import { parseDefaultDrivesUrl } from "./parse-default-drives.js";

type PlainObject = Record<string, unknown>;

/**
 * Structural input shape consumed by `buildConnectFlagPatch`. Every property
 * is strict-optional — `undefined` means "user did not pass this flag" and
 * the path is excluded from the patch.
 *
 * Callers with cmd-ts-typed args where some flags have built-in defaults
 * (e.g. the 4 commonArgs flags `--base` / `--log-level` /
 * `--default-drives-url` / `--drive-preserve-strategy`) must filter through
 * `wasFlagExplicitlyPassed` BEFORE building this input — otherwise default
 * values like `"info"` will silently clobber source `powerhouse.config.json`
 * values.
 */
export type ConnectFlagInput = {
  // 14 strict-optional flags from connectRuntimeOverrideArgs (excluding
  // `packagesRegistry`, which is a top-level runtime field — see
  // `buildCliConnectOverride`).
  json?: string | undefined;
  renownUrl?: string | undefined;
  renownNetworkId?: string | undefined;
  renownChainId?: number | undefined;
  allowAddDrive?: boolean | undefined;
  externalPackages?: boolean | undefined;
  remoteDrivesEnabled?: boolean | undefined;
  remoteDrivesAllowAdd?: boolean | undefined;
  remoteDrivesAllowDelete?: boolean | undefined;
  localDrivesEnabled?: boolean | undefined;
  localDrivesAllowAdd?: boolean | undefined;
  localDrivesAllowDelete?: boolean | undefined;
  appName?: string | undefined;
  homeBackground?: string | undefined;
  // 4 commonArgs flags. Callers must apply `wasFlagExplicitlyPassed`
  // filtering (see above).
  basePath?: string | undefined;
  logLevel?: string | undefined;
  defaultDrivesUrl?: string | undefined;
  drivesPreserveStrategy?: string | undefined;
};

/**
 * Parse the `--json` payload (if any). Throws on malformed JSON or on a
 * non-object root with a clear, command-line-visible error.
 */
function parseJsonOverride(raw: string | undefined): PlainObject {
  if (raw === undefined || raw === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `--json: invalid JSON (${msg}). Expected a partial 'connect.*' blob, e.g. --json '{"renown":{"url":"..."}}'.`,
      { cause: e },
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `--json: payload must be a JSON object, got ${typeof parsed}.`,
    );
  }
  return parsed as PlainObject;
}

/**
 * Re-exported for `runConnectConfig` so the same JSON validation runs for
 * both `build --json` and `config --json`.
 */
export function parseConnectJsonArg(raw: string | undefined): PlainObject {
  return parseJsonOverride(raw);
}

function setIfDefined<V>(
  target: PlainObject,
  key: string,
  value: V | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

/**
 * Detect whether the user literally typed `--<longName>` on the command
 * line. Used to gate the 4 commonArgs flags through `cliConnectOverride` —
 * those flags have cmd-ts defaults, so their parsed value is always
 * defined, and a naive merge would silently clobber source values with the
 * default on every build.
 *
 * Handles both `--flag value` and `--flag=value` forms.
 */
export function wasFlagExplicitlyPassed(longName: string): boolean {
  const dashed = `--${longName}`;
  return process.argv.some(
    (arg) => arg === dashed || arg.startsWith(`${dashed}=`),
  );
}

/**
 * Build a `connect.*` partial from the 19 field flags. Only includes paths
 * the user explicitly set (undefined values are excluded).
 *
 * Single source of truth for the flag → JSON-path mapping; consumed by both
 * `ph connect build` and `ph connect config`.
 */
export function buildConnectFlagPatch(args: ConnectFlagInput): PlainObject {
  const out: PlainObject = {};

  const app: PlainObject = {};
  setIfDefined(app, "basePath", args.basePath);
  setIfDefined(app, "logLevel", args.logLevel);
  if (Object.keys(app).length > 0) out.app = app;

  const renown: PlainObject = {};
  setIfDefined(renown, "url", args.renownUrl);
  setIfDefined(renown, "networkId", args.renownNetworkId);
  setIfDefined(renown, "chainId", args.renownChainId);
  if (Object.keys(renown).length > 0) out.renown = renown;

  const packages: PlainObject = {};
  setIfDefined(packages, "externalEnabled", args.externalPackages);
  if (Object.keys(packages).length > 0) out.packages = packages;

  // --home-background: empty string is the explicit "set null" form
  // (cmd-ts can't pass `null` directly through a string option).
  const branding: PlainObject = {};
  setIfDefined(branding, "appName", args.appName);
  if (args.homeBackground !== undefined) {
    branding.homeBackground =
      args.homeBackground === "" ? null : args.homeBackground;
  }
  if (Object.keys(branding).length > 0) out.branding = branding;

  const drives: PlainObject = {};
  setIfDefined(drives, "allowAddDrive", args.allowAddDrive);
  setIfDefined(drives, "preserveStrategy", args.drivesPreserveStrategy);
  if (args.defaultDrivesUrl !== undefined && args.defaultDrivesUrl !== "") {
    drives.defaultDrives = parseDefaultDrivesUrl(args.defaultDrivesUrl);
  }

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
 * Combine `--json` and the individual flag values into the two override
 * inputs `ph connect build` forwards to the Vite plugin:
 *
 *   - `connectOverride`: a partial `connect.*` patch (deep-merged at the top
 *     of the runtime-config precedence ladder).
 *   - `packageRegistryUrl`: a separate top-level override; mirrors the
 *     source-config top-level field (the SPA reads it directly).
 *
 * `--packages-registry` and `--json` containing a top-level
 * `packageRegistryUrl` both flow into `packageRegistryUrl`; the flag wins on
 * collision. Returns `undefined` for whichever override was not supplied.
 *
 * The 4 commonArgs flags (`--base`, `--log-level`, `--default-drives-url`,
 * `--drive-preserve-strategy`) are gated through `wasFlagExplicitlyPassed`
 * because they carry cmd-ts defaults that would otherwise leak into the
 * override on every build.
 */
export function buildCliConnectOverride(args: ConnectBuildArgs): {
  connectOverride: PHConnectRuntimeConfig | undefined;
  packageRegistryUrl: string | undefined;
} {
  const fromJson = parseJsonOverride(args.json);

  const input: ConnectFlagInput = {
    renownUrl: args.renownUrl,
    renownNetworkId: args.renownNetworkId,
    renownChainId: args.renownChainId,
    allowAddDrive: args.allowAddDrive,
    externalPackages: args.externalPackages,
    remoteDrivesEnabled: args.remoteDrivesEnabled,
    remoteDrivesAllowAdd: args.remoteDrivesAllowAdd,
    remoteDrivesAllowDelete: args.remoteDrivesAllowDelete,
    localDrivesEnabled: args.localDrivesEnabled,
    localDrivesAllowAdd: args.localDrivesAllowAdd,
    localDrivesAllowDelete: args.localDrivesAllowDelete,
    appName: args.appName,
    homeBackground: args.homeBackground,
    // 4 commonArgs flags — only forward when the user explicitly passed them.
    basePath: wasFlagExplicitlyPassed("base")
      ? args.connectBasePath
      : undefined,
    logLevel: wasFlagExplicitlyPassed("log-level") ? args.logLevel : undefined,
    defaultDrivesUrl: wasFlagExplicitlyPassed("default-drives-url")
      ? args.defaultDrivesUrl
      : undefined,
    drivesPreserveStrategy: wasFlagExplicitlyPassed("drive-preserve-strategy")
      ? args.drivesPreserveStrategy
      : undefined,
  };

  const fromFlags = buildConnectFlagPatch(input);
  // Top-level `packageRegistryUrl` can come from --json (top-level) or from
  // --packages-registry. The flag wins on collision.
  const jsonRegistry =
    typeof fromJson.packageRegistryUrl === "string"
      ? (fromJson.packageRegistryUrl as string)
      : undefined;
  const packageRegistryUrl = args.packagesRegistry ?? jsonRegistry;
  // Strip the top-level field from the JSON patch before deep-merging into
  // the connect partial — it isn't a `connect.*` field.
  const jsonConnect = { ...fromJson };
  delete jsonConnect.packageRegistryUrl;

  const hasJsonConnect = Object.keys(jsonConnect).length > 0;
  const hasFlags = Object.keys(fromFlags).length > 0;
  const connectOverride =
    !hasJsonConnect && !hasFlags
      ? undefined
      : deepMerge(
          jsonConnect as PHConnectRuntimeConfig,
          fromFlags as PHConnectRuntimeConfig,
        );

  return { connectOverride, packageRegistryUrl };
}

/**
 * Parallel of `buildCliConnectOverride` for `ph connect studio` / `ph vetra`.
 * Studio only exposes the 4 commonArgs flags (`--base`, `--log-level`,
 * `--default-drives-url`, `--drive-preserve-strategy`); each is gated through
 * `wasFlagExplicitlyPassed` so cmd-ts defaults don't leak into the override.
 *
 * `callerOverride` is supplied by wrappers around studio (notably `ph vetra`,
 * which sets default drives + preserveStrategy directly) and deep-merges on
 * top of the user-flag override, so caller choices stick even when the user
 * didn't type the corresponding flag.
 */
export function buildStudioConnectOverride(
  args: ConnectStudioArgs,
  callerOverride: PHConnectRuntimeConfig | undefined,
): PHConnectRuntimeConfig | undefined {
  const flagOverride = buildConnectFlagPatch({
    basePath: wasFlagExplicitlyPassed("base")
      ? args.connectBasePath
      : undefined,
    logLevel: wasFlagExplicitlyPassed("log-level") ? args.logLevel : undefined,
    defaultDrivesUrl: wasFlagExplicitlyPassed("default-drives-url")
      ? args.defaultDrivesUrl
      : undefined,
    drivesPreserveStrategy: wasFlagExplicitlyPassed("drive-preserve-strategy")
      ? args.drivesPreserveStrategy
      : undefined,
  }) as PHConnectRuntimeConfig;

  const hasFlag = Object.keys(flagOverride).length > 0;
  if (!hasFlag) return callerOverride;
  if (callerOverride === undefined) return flagOverride;
  return deepMerge(flagOverride, callerOverride);
}
