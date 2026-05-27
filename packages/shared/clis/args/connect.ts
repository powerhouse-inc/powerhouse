import type { Type } from "cmd-ts";
import { number, option, optional, positional, string } from "cmd-ts";
import {
  DEFAULT_CONNECT_OUTDIR,
  DEFAULT_CONNECT_PREVIEW_PORT,
  DEFAULT_CONNECT_STUDIO_PORT,
} from "../constants.js";
import {
  commonArgs,
  commonServerArgs,
  connectBasePath,
  defaultDrivesUrl,
  drivesPreserveStrategy,
  logLevel,
} from "./common.js";

// cmd-ts's built-in `boolean` is intended for `flag()` (presence/absence). With
// `option()` we need to parse the next argv as a value, but cmd-ts's `boolean`
// does not coerce the string. This custom Type does.
const cliBoolean: Type<string, boolean> = {
  from: (input) => {
    const v = input.toLowerCase();
    if (v === "true" || v === "1") return Promise.resolve(true);
    if (v === "false" || v === "0") return Promise.resolve(false);
    return Promise.reject(
      new Error(
        `Expected 'true' or 'false' (case-insensitive), got '${input}'.`,
      ),
    );
  },
  description: "true | false",
};

export const connectStudioArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the dev server on.",
    defaultValue: () => DEFAULT_CONNECT_STUDIO_PORT,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

// Runtime-config override flags. Each is optional with no default — undefined
// means "user did not pass this flag", so runConnectBuild can include only
// explicitly-set values in `cliConnectOverride` and avoid clobbering source
// `powerhouse.config.json` values when no override was intended.
//
// These flags occupy the top of the precedence ladder for the runtime config
// emitted into `dist/powerhouse.config.json`:
//
//   DEFAULT_CONNECT_CONFIG  <  env-var seeds  <  source connect.*  <  --json  <  individual --flag
//
// `--json` accepts a partial `connect.*` blob (e.g. `{"renown":{"url":"..."}}`).
// Individual flags merge on top of `--json` inside the same CLI layer, so they
// win on collision.
const connectRuntimeOverrideArgs = {
  json: option({
    type: optional(string),
    long: "json",
    description:
      'Inline JSON override for the runtime connect.* block, e.g. \'{"renown":{"url":"..."}}\'. Validated against the runtime schema; deep-merged on top of env seeds and source powerhouse.config.json. Individual --flag values beat --json on collision.',
  }),
  renownUrl: option({
    type: optional(string),
    long: "renown-url",
    description: "Override connect.renown.url.",
  }),
  renownNetworkId: option({
    type: optional(string),
    long: "renown-network-id",
    description: "Override connect.renown.networkId.",
  }),
  renownChainId: option({
    type: optional(number),
    long: "renown-chain-id",
    description: "Override connect.renown.chainId.",
  }),
  allowAddDrive: option({
    type: optional(cliBoolean),
    long: "allow-add-drive",
    description:
      "Override connect.drives.allowAddDrive (top-level add-drive toggle).",
  }),
  externalPackages: option({
    type: optional(cliBoolean),
    long: "external-packages",
    description: "Override connect.packages.externalEnabled.",
  }),
  remoteDrivesEnabled: option({
    type: optional(cliBoolean),
    long: "remote-drives-enabled",
    description:
      "Override connect.drives.sections.remote.enabled (the unified cloud+public section).",
  }),
  remoteDrivesAllowAdd: option({
    type: optional(cliBoolean),
    long: "remote-drives-allow-add",
    description: "Override connect.drives.sections.remote.allowAdd.",
  }),
  remoteDrivesAllowDelete: option({
    type: optional(cliBoolean),
    long: "remote-drives-allow-delete",
    description: "Override connect.drives.sections.remote.allowDelete.",
  }),
  localDrivesEnabled: option({
    type: optional(cliBoolean),
    long: "local-drives-enabled",
    description: "Override connect.drives.sections.local.enabled.",
  }),
  localDrivesAllowAdd: option({
    type: optional(cliBoolean),
    long: "local-drives-allow-add",
    description: "Override connect.drives.sections.local.allowAdd.",
  }),
  localDrivesAllowDelete: option({
    type: optional(cliBoolean),
    long: "local-drives-allow-delete",
    description: "Override connect.drives.sections.local.allowDelete.",
  }),
  packagesRegistry: option({
    type: optional(string),
    long: "packages-registry",
    description: "Override the top-level packageRegistryUrl.",
  }),
  appName: option({
    type: optional(string),
    long: "app-name",
    description: "Override connect.branding.appName.",
  }),
  homeBackground: option({
    type: optional(string),
    long: "home-background",
    description:
      'Override connect.branding.homeBackground. URL or path to an image; pass an empty string ("") to reset to the bundled default.',
  }),
  sentryDsn: option({
    type: optional(string),
    long: "sentry-dsn",
    description:
      'Override connect.sentry.dsn (Sentry DSN URL). Pass an empty string ("") to set null and disable Sentry.',
  }),
  sentryEnv: option({
    type: optional(string),
    long: "sentry-env",
    description: "Override connect.sentry.env (Sentry environment label).",
  }),
  sentryTracingEnabled: option({
    type: optional(cliBoolean),
    long: "sentry-tracing-enabled",
    description:
      "Override connect.sentry.tracing (Sentry performance tracing).",
  }),
};

// Positional pair shared by `ph connect build` and `ph connect config`. Both
// commands accept `<key> <value>` to set a single runtime-config field; `config`
// additionally accepts `<key>` alone for read-mode (`build` rejects the
// 1-positional case because it has no read semantics). Both are optional in the
// parser; the handler enforces the per-command shape.
const connectPositionalArgs = {
  keyPositional: positional({
    type: optional(string),
    displayName: "key",
    description:
      "Dotted path inside the runtime config (e.g. connect.renown.url). Pair with <value> to set; pass alone to `ph connect config` to read.",
  }),
  valuePositional: positional({
    type: optional(string),
    displayName: "value",
    description:
      "Value to set at <key>. Coerced against the runtime schema (string, bool, number, enum). Arrays and objects require --json instead.",
  }),
};

export const connectBuildArgs = {
  outDir: option({
    type: string,
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...connectRuntimeOverrideArgs,
  ...connectPositionalArgs,
  ...commonArgs,
};

export const connectPreviewArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the preview server on.",
    defaultValue: () => DEFAULT_CONNECT_PREVIEW_PORT,
    defaultValueIsSerializable: true,
  }),
  outDir: option({
    type: string,
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

// `ph connect config` — read, set, or list the runtime config under the
// `connect.*` block of the dist `powerhouse.config.json`.
//
// Mode matrix (exactly one mode per invocation; mutex enforced in
// `runConnectConfig`):
//
//   ph connect config                       → list (print effective merged config)
//   ph connect config <key>                 → get one value at the dotted key (positional)
//   ph connect config --get <dotted.path>   → same as positional <key> (kept for backward compat)
//   ph connect config <key> <value>         → set + dual-write to source + dist (positional)
//   ph connect config --<field> <value>     → set + dual-write via per-field flag
//   ph connect config --json '{"…":"…"}'   → bulk set + dual-write
//
// The 15 field flags below come from `connectRuntimeOverrideArgs`, so
// `config` and `build` share an identical surface for runtime fields. The 4
// flags imported individually from `common.ts` (`connectBasePath` /
// `logLevel` / `defaultDrivesUrl` / `drivesPreserveStrategy`) extend that to
// 19-flag coverage. The positional `<key>`/`<value>` pair is also shared with
// `ph connect build` so both commands accept the same set-mode grammar.
// `--dist-dir` lets Docker / non-default deployments point at a custom dist
// location; falls back to PH_CONNECT_OUTDIR env, then to the standard
// `.ph/connect-build/dist/` path.
//
// NOTE: the 4 commonArgs flags have built-in cmd-ts defaults
// (e.g. logLevel="info"), so always parse as defined. The service detects
// "user explicitly passed this flag" via process.argv inspection — see
// `clis/ph-cli/src/utils/cli-connect-override.ts:wasFlagExplicitlyPassed`.
export const connectConfigArgs = {
  get: option({
    type: optional(string),
    long: "get",
    description:
      'Dotted path inside connect.* (e.g. "connect.renown.url") to read the effective value. Mutually exclusive with the set modes. Equivalent to `ph connect config <key>` (positional).',
  }),
  distDir: option({
    type: optional(string),
    long: "dist-dir",
    description:
      "Path to the directory containing the dist powerhouse.config.json. Defaults to the PH_CONNECT_OUTDIR env or `.ph/connect-build/dist/`.",
  }),
  ...connectRuntimeOverrideArgs,
  ...connectPositionalArgs,
  connectBasePath,
  logLevel,
  defaultDrivesUrl,
  drivesPreserveStrategy,
};

export const connectArgs = {
  ...connectStudioArgs,
  ...connectBuildArgs,
  ...connectPreviewArgs,
  ...connectConfigArgs,
};
