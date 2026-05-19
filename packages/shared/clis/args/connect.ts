import type { Type } from "cmd-ts";
import { number, option, optional, string } from "cmd-ts";
import {
  DEFAULT_CONNECT_OUTDIR,
  DEFAULT_CONNECT_PREVIEW_PORT,
  DEFAULT_CONNECT_STUDIO_PORT,
} from "../constants.js";
import { commonArgs, commonServerArgs } from "./common.js";

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

export const connectArgs = {
  ...connectStudioArgs,
  ...connectBuildArgs,
  ...connectPreviewArgs,
};
