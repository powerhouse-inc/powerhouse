// `ph connect config` — read or update Connect's runtime configuration.
//
// Mode dispatch (exactly one mode per invocation; mutex enforced below):
//
//   ph connect config                              → list mode (print effective merged config)
//   ph connect config --get <dotted.path>          → get mode (print one value)
//   ph connect config --<field> <value>            → set mode (dual-write source + dist)
//   ph connect config --json '{...}'               → bulk-set mode (dual-write)
//
// Dual-write semantics for set / bulk-set:
//   - Source `powerhouse.config.json` (project root) gets the connect.* patch
//     deep-merged in. This is what the next `ph connect build` will respect.
//   - Dist `powerhouse.config.json` (default `.ph/connect-build/dist/`) gets
//     the same patch deep-merged in. This is what the currently-served SPA
//     sees on its next /powerhouse.config.json fetch (page refresh).
//
// The dist write is skipped silently if the dist file doesn't exist — that's
// the "config-only-before-first-build" workflow, not an error.
//
// The 15 field flags + the 4 commonArgs flags (base, log-level,
// default-drives-url, drive-preserve-strategy) come from the same source as
// `ph connect build`'s flags, so the two commands share identical CLI
// surfaces. The 4 commonArgs flags carry cmd-ts defaults; we gate them
// through `wasFlagExplicitlyPassed` for the same reason `buildCliConnectOverride`
// does — to avoid leaking default values into a write the user didn't
// request.

import {
  ConfigLoader,
  DEFAULT_CONNECT_CONFIG,
  JsonConfigAdapter,
  deepMerge,
} from "@powerhousedao/shared/connect";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ConnectConfigArgs } from "../types.js";
import {
  buildConnectFlagPatch,
  type ConnectFlagInput,
  wasFlagExplicitlyPassed,
} from "../utils/cli-connect-override.js";
import {
  normalizeKey,
  validateConnectPatch,
} from "../utils/connect-config-validation.js";

type ConnectPartial = Partial<PHConnectRuntimeConfig>;

const SOURCE_FILE = "powerhouse.config.json";
const DEFAULT_DIST_SUBPATH = ".ph/connect-build/dist";

function resolveSourcePath(cwd: string): string {
  return join(cwd, SOURCE_FILE);
}

function resolveDistPath(cwd: string, distDirArg: string | undefined): string {
  const fromArg = distDirArg;
  const fromEnv = process.env.PH_CONNECT_OUTDIR;
  const dir = fromArg ?? fromEnv ?? DEFAULT_DIST_SUBPATH;
  const abs = isAbsolute(dir) ? dir : resolve(cwd, dir);
  return join(abs, SOURCE_FILE);
}

function getAtPath(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Read the source file's raw bytes (no merge with defaults). Returns an empty
 * object stub when the file doesn't exist — the operator can config their way
 * to a complete file before ever running `ph connect build`.
 */
async function readSourceRaw(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  const adapter = new JsonConfigAdapter({ path });
  const raw = await adapter.read();
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

async function writeSourceRaw(
  path: string,
  next: Record<string, unknown>,
): Promise<void> {
  const adapter = new JsonConfigAdapter({ path });
  // ConfigShape requires a `connect` key; ensure it's present.
  const shape = {
    ...next,
    connect: (next.connect as PHConnectRuntimeConfig | undefined) ?? {},
  };
  await adapter.write(shape);
}

/**
 * Build the merged "effective" connect block for list/get mode: defaults <
 * source.connect. Doesn't go through env or dist — list mode shows what the
 * source declares + defaults, which is what the next build will produce as a
 * baseline (before env seeds + CLI overrides).
 */
function effectiveConnect(
  source: Record<string, unknown>,
): PHConnectRuntimeConfig {
  const sourceConnect =
    source.connect &&
    typeof source.connect === "object" &&
    !Array.isArray(source.connect)
      ? (source.connect as ConnectPartial)
      : {};
  return deepMerge(DEFAULT_CONNECT_CONFIG, sourceConnect);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Translate the parsed `ph connect config` args into the structural
 * `ConnectFlagInput` consumed by `buildConnectFlagPatch`. The 4 commonArgs
 * flags are gated through `wasFlagExplicitlyPassed` — their cmd-ts default
 * values must not leak into a write the user didn't request.
 */
function argsToFlagInput(args: ConnectConfigArgs): ConnectFlagInput {
  return {
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
    packagesRegistry: args.packagesRegistry,
    appName: args.appName,
    homeBackground: args.homeBackground,
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
}

/**
 * Whether any field flag (any of the 19) was passed. Distinguishes the
 * single-field-set mode from list mode when neither `--get` nor `--json` is
 * present.
 */
function hasAnyFieldFlag(input: ConnectFlagInput): boolean {
  // Object.values doesn't include json (which isn't in ConnectFlagInput here).
  return Object.values(input).some((v) => v !== undefined);
}

export async function runConnectConfig(args: ConnectConfigArgs): Promise<void> {
  const cwd = process.cwd();
  const sourcePath = resolveSourcePath(cwd);
  const distPath = resolveDistPath(cwd, args.distDir);

  const flagInput = argsToFlagInput(args);
  const hasGet = args.get !== undefined;
  const hasJson = args.json !== undefined;
  const hasFieldFlag = hasAnyFieldFlag(flagInput);

  // Mutex: get / json / any field flag are mutually exclusive. Exactly one
  // mode (or none → list) per call.
  const modeCount = [hasGet, hasJson, hasFieldFlag].filter(Boolean).length;
  if (modeCount > 1) {
    throw new Error(
      "ph connect config: --get, --json, and individual field flags are mutually exclusive. Use one mode per invocation.",
    );
  }

  const source = await readSourceRaw(sourcePath);

  // List mode.
  if (modeCount === 0) {
    printJson(effectiveConnect(source));
    return;
  }

  // Get mode.
  if (hasGet) {
    const normalized = normalizeKey(args.get!);
    if (!normalized) {
      throw new Error(
        "ph connect config --get: key cannot be empty. Pass a dotted path inside connect.* (e.g. --get connect.renown.url).",
      );
    }
    const value = getAtPath(effectiveConnect(source), normalized);
    if (value === undefined) {
      throw new Error(
        `ph connect config --get: no value at key "${normalized}". Run \`ph connect config\` (no args) to see the available paths.`,
      );
    }
    printJson(value);
    return;
  }

  // Set / bulk-set mode. Build the patch from --json (Ajv-validated) or from
  // field flags (shape is guaranteed by cmd-ts type coercion).
  const patch = hasJson
    ? (validateConnectPatch(args.json!) as ConnectPartial)
    : (buildConnectFlagPatch(flagInput) as ConnectPartial);

  if (Object.keys(patch).length === 0) {
    throw new Error(
      "ph connect config: nothing to set. Pass at least one field flag (e.g. --renown-url <url>) or --json with a non-empty payload.",
    );
  }

  // Build the next source: take what's there, deep-merge patch under .connect.
  const currentConnect =
    source.connect &&
    typeof source.connect === "object" &&
    !Array.isArray(source.connect)
      ? (source.connect as PHConnectRuntimeConfig)
      : ({} as PHConnectRuntimeConfig);
  const nextConnect = deepMerge(
    currentConnect,
    patch as PHConnectRuntimeConfig,
  );
  const nextSource = { ...source, connect: nextConnect };

  await writeSourceRaw(sourcePath, nextSource);

  // Dual-write to dist if it exists. The dist file has a full schema (with
  // $schema, schemaVersion, packages, localPackage) that we preserve — we
  // only deep-merge the connect.* block.
  if (existsSync(distPath)) {
    const distLoader = new ConfigLoader(
      new JsonConfigAdapter({ path: distPath }),
    );
    await distLoader.write({ connect: patch });
  }

  process.stdout.write(
    `ph connect config: wrote ${sourcePath}${existsSync(distPath) ? ` and ${distPath}` : ""}\n`,
  );
}
