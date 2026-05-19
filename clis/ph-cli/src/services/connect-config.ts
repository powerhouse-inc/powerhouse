// `ph connect config` — read or update Connect's runtime configuration.
//
// Three modes, dispatched by which positionals / flags the operator passes:
//
//   ph connect config                  → list mode: print effective merged config
//   ph connect config <key>            → get mode: print value at the dotted key
//   ph connect config <key> <value>    → set mode: dual-write to source + dist
//   ph connect config --json '{...}'   → bulk set mode: dual-write
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
  normalizeKey,
  validateConnectKeyValue,
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

export async function runConnectConfig(args: ConnectConfigArgs): Promise<void> {
  const cwd = process.cwd();
  const sourcePath = resolveSourcePath(cwd);
  const distPath = resolveDistPath(cwd, args.distDir);

  // Validate args combinations.
  if (
    args.json !== undefined &&
    (args.key !== undefined || args.value !== undefined)
  ) {
    throw new Error(
      "ph connect config: --json is mutually exclusive with positional <key> [value]. Use one or the other.",
    );
  }

  const source = await readSourceRaw(sourcePath);

  // List mode.
  if (
    args.json === undefined &&
    args.key === undefined &&
    args.value === undefined
  ) {
    printJson(effectiveConnect(source));
    return;
  }

  // Get mode (key without value, no --json).
  if (
    args.json === undefined &&
    args.key !== undefined &&
    args.value === undefined
  ) {
    const normalized = normalizeKey(args.key);
    const value = getAtPath(effectiveConnect(source), normalized);
    if (value === undefined) {
      throw new Error(
        `ph connect config: no value at key "${normalized}". Run \`ph connect config\` (no args) to see the available paths.`,
      );
    }
    printJson(value);
    return;
  }

  // Set / bulk-set mode.
  const patch =
    args.json !== undefined
      ? validateConnectPatch(args.json)
      : validateConnectKeyValue(args.key!, args.value!);

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
