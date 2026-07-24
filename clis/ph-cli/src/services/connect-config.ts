// `ph connect config` — read or update Connect's runtime configuration.
//
// Mode dispatch (exactly one mode per invocation; mutex enforced below):
//
//   ph connect config                              → list mode (print effective merged config)
//   ph connect config <key>                        → get mode (positional)
//   ph connect config --get <dotted.path>          → get mode (flag form, equivalent)
//   ph connect config <key> <value>                → set mode (positional, dual-write source + dist)
//   ph connect config --<field> <value>            → set mode (flag form)
//   ph connect config --json '{...}'               → bulk-set mode (dual-write)
//
// Dual-write semantics for set / bulk-set:
//   - Source `powerhouse.config.json` (project root) gets the connect.* patch
//     deep-merged into `connect.*`. `--packages-registry` lands at the
//     top-level `packageRegistryUrl` field (project-wide setting, also read
//     by `ph install` / `ph publish` / Switchboard).
//   - Dist `powerhouse.config.json` (default `.ph/connect-build/dist/`) gets
//     the same connect.* patch deep-merged in, and the same top-level
//     `packageRegistryUrl` if set. The runtime schema mirrors the source
//     schema, so the field lives at the same path in both files.
//
// The dist write is skipped silently if the dist file doesn't exist — that's
// the "config-only-before-first-build" workflow, not an error.
//
// Field flags + the 4 commonArgs flags (base, log-level, default-drives-url,
// drive-preserve-strategy) come from the same source as `ph connect build`'s
// flags, so the two commands share identical CLI surfaces. The 4 commonArgs
// flags carry cmd-ts defaults; we gate them through `wasFlagExplicitlyPassed`
// for the same reason `buildCliConnectOverride` does — to avoid leaking
// default values into a write the user didn't request.

import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import {
  ConfigLoader,
  DEFAULT_CONNECT_CONFIG,
  JsonConfigAdapter,
  deepMerge,
} from "@powerhousedao/shared/connect";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { stringToPath } from "remeda";
import type { ConnectConfigArgs } from "../types.js";
import {
  buildConnectFlagPatch,
  wasFlagExplicitlyPassed,
  type ConnectFlagInput,
} from "../utils/cli-connect-override.js";
import {
  normalizeKey,
  parseCliValue,
  validateConnectKeyValue,
  validateConnectPatch,
} from "../utils/connect-config-validation.js";
import { getAtPath } from "../utils/get-at-path.js";

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
 * `ConnectFlagInput` consumed by `buildConnectFlagPatch`. Common-args flags
 * with cmd-ts defaults are gated through `wasFlagExplicitlyPassed` so the
 * defaults don't leak into a write the user didn't request. `--base` is
 * not translated here — it's rejected up front by `runConnectConfig`.
 */
function argsToFlagInput(args: ConnectConfigArgs): ConnectFlagInput {
  return {
    renownUrl: args.renownUrl,
    renownNetworkId: args.renownNetworkId,
    renownChainId: args.renownChainId,
    renownNamespace: args.renownNamespace,
    renownSwitchboardUrl: args.renownSwitchboardUrl,
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
    sentryDsn: args.sentryDsn,
    sentryEnv: args.sentryEnv,
    sentryTracingEnabled: args.sentryTracingEnabled,
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
  // Cast to a generic record so the `!== undefined` predicate is type-aware:
  // ConnectFlagInput's optional properties narrow `v` in a way TS thinks
  // excludes `undefined`, even though at runtime any of them can be unset.
  return Object.values(input as Record<string, unknown>).some(
    (v) => v !== undefined,
  );
}

export async function runConnectConfig(args: ConnectConfigArgs): Promise<void> {
  // `--base` is a build-time field (baked into the Vite bundle's asset URLs
  // and the nginx config template), so writing it post-build leaves the
  // layers disagreeing and the SPA's assets 404. The flag stays declared so
  // cmd-ts parses it; we reject explicit use here with an actionable error.
  if (wasFlagExplicitlyPassed("base")) {
    throw new Error(
      "ph connect config: --base is a build-time field; run `ph connect build --base <value>` and redeploy the container (or restart with PH_CONNECT_BASE_PATH=<value> set in the environment).",
    );
  }

  const cwd = process.cwd();
  const sourcePath = resolveSourcePath(cwd);
  const distPath = resolveDistPath(cwd, args.distDir);

  const flagInput = argsToFlagInput(args);
  const hasGet = args.get !== undefined;
  const hasJson = args.json !== undefined;
  const hasFieldFlag = hasAnyFieldFlag(flagInput);
  // `--packages-registry` is a top-level field, not part of the connect-flag
  // patch. Track it separately so the set-mode write puts it in the right
  // place and the mutex counts it as a "field flag".
  const explicitRegistry = args.packagesRegistry;
  const hasExplicitRegistry = explicitRegistry !== undefined;
  // Positional pair: 1 positional = get, 2 = set. cmd-ts assigns the first
  // positional to `keyPositional` and the second to `valuePositional`, so a
  // standalone <value> isn't representable here.
  const hasPositionalKey = args.keyPositional !== undefined;
  const hasPositionalValue = args.valuePositional !== undefined;
  const hasPositional = hasPositionalKey;

  // Mutex: positional / --get / --json / (any field flag OR
  // --packages-registry) are mutually exclusive. Exactly one mode (or none →
  // list) per call. Counting positional as a single mode regardless of arity:
  // a `<key>` alone is a get, `<key> <value>` is a set, both occupy the same
  // "positional mode" slot vs. the other forms.
  const modeCount = [
    hasPositional,
    hasGet,
    hasJson,
    hasFieldFlag || hasExplicitRegistry,
  ].filter(Boolean).length;
  if (modeCount > 1) {
    throw new Error(
      "ph connect config: positional <key>/<value>, --get, --json, and individual field flags are mutually exclusive. Use one mode per invocation.",
    );
  }

  const source = await readSourceRaw(sourcePath);

  // List mode.
  if (modeCount === 0) {
    printJson(effectiveConnect(source));
    return;
  }

  // Get mode (either positional `<key>` alone or `--get <key>`).
  if (hasGet || (hasPositional && !hasPositionalValue)) {
    const rawKey = hasGet ? args.get! : args.keyPositional!;
    const sourceLabel = hasGet ? "--get" : "<key>";
    const normalized = normalizeKey(rawKey);
    if (!normalized) {
      throw new Error(
        `ph connect config ${sourceLabel}: key cannot be empty. Pass a dotted path inside connect.* (e.g. connect.renown.url).`,
      );
    }
    // `packageRegistryUrl` is a top-level field — look it up on the raw
    // source object, not inside `effectiveConnect`.
    if (normalized === "packageRegistryUrl") {
      const value = source.packageRegistryUrl;
      if (value === undefined) {
        throw new Error(
          `ph connect config ${sourceLabel}: no value at key "${normalized}". Run \`ph connect config\` (no args) to see the available paths.`,
        );
      }
      printJson(value);
      return;
    }
    const value = getAtPath(effectiveConnect(source), stringToPath(normalized));
    if (value === undefined) {
      throw new Error(
        `ph connect config ${sourceLabel}: no value at key "${normalized}". Run \`ph connect config\` (no args) to see the available paths.`,
      );
    }
    printJson(value);
    return;
  }

  // Set / bulk-set mode. Build the connect-side patch from positional
  // `<key> <value>` (Ajv-validated against the schema at that path), --json
  // (Ajv-validated as a partial connect.* blob), or individual field flags
  // (shape guaranteed by cmd-ts type coercion). `--packages-registry` is a
  // top-level field; if positional `<key>` is `packageRegistryUrl` or --json
  // carries it, route that to the top-level write.
  let topLevelRegistry: string | undefined = explicitRegistry;
  let patch: ConnectPartial;
  if (hasPositional && hasPositionalValue) {
    const normalized = normalizeKey(args.keyPositional!);
    if (!normalized) {
      throw new Error(
        "ph connect config <key>: key cannot be empty. Pass a dotted path inside connect.* (e.g. connect.renown.url).",
      );
    }
    // Top-level: positional `packageRegistryUrl <value>` writes the top-level
    // field instead of a connect.* path.
    if (normalized === "packageRegistryUrl") {
      const parsed = parseCliValue(args.valuePositional!);
      if (typeof parsed !== "string") {
        throw new Error(
          `ph connect config: packageRegistryUrl must be a string (got ${typeof parsed}).`,
        );
      }
      topLevelRegistry = parsed;
      patch = {};
    } else {
      patch = validateConnectKeyValue(
        normalized,
        args.valuePositional!,
      ) as ConnectPartial;
    }
  } else if (hasJson) {
    const validated = validateConnectPatch(args.json!) as Record<
      string,
      unknown
    >;
    if (typeof validated.packageRegistryUrl === "string") {
      topLevelRegistry = topLevelRegistry ?? validated.packageRegistryUrl;
    }
    const connectOnly = { ...validated };
    delete connectOnly.packageRegistryUrl;
    patch = connectOnly as ConnectPartial;
  } else {
    patch = buildConnectFlagPatch(flagInput) as ConnectPartial;
  }

  if (Object.keys(patch).length === 0 && topLevelRegistry === undefined) {
    throw new Error(
      "ph connect config: nothing to set. Pass at least one field flag (e.g. --renown-url <url>) or --json with a non-empty payload.",
    );
  }

  // Build the next source: top-level packageRegistryUrl (if set) +
  // connect.* deep-merge.
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
  const nextSource: Record<string, unknown> = {
    ...source,
    connect: nextConnect,
  };
  if (topLevelRegistry !== undefined) {
    nextSource.packageRegistryUrl = topLevelRegistry;
  }

  await writeSourceRaw(sourcePath, nextSource);

  // Dual-write to dist if it exists. Same shape as source: connect.* block
  // is deep-merged; top-level `packageRegistryUrl` is set in place.
  if (existsSync(distPath)) {
    const distLoader = new ConfigLoader(
      new JsonConfigAdapter({ path: distPath }),
    );
    const distPatch: Record<string, unknown> = { connect: patch };
    if (topLevelRegistry !== undefined) {
      distPatch.packageRegistryUrl = topLevelRegistry;
    }
    await distLoader.write(distPatch);
  }

  process.stdout.write(
    `ph connect config: wrote ${sourcePath}${existsSync(distPath) ? ` and ${distPath}` : ""}\n`,
  );
}
