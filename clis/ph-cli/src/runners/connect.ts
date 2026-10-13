import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import {
  profileSchema,
  projectReactorToConnect,
  reactorSchema,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { z } from "zod";
import type {
  ConnectBuildArgs,
  ConnectPreviewArgs,
  ConnectStudioArgs,
} from "../types.js";

/**
 * BRIDGE runner for Connect hosts (uniform-runners phase 0): maps a
 * hosts/connect/host.js definition onto the SAME service the classic
 * `ph connect studio` command calls — no forked behavior. Real verbs
 * (`build`, `serve`) arrive with later phases; their absence here is
 * deliberate and surfaces through the verb-listing error.
 */

export const kind = "reactor";

/** Phase-2 schema (D2.d): `reactor` and `profile` validate strictly via the
 * shared host-core schemas — a typo'd protocol key fails instead of silently
 * not applying. `config` stays loose: it is runner-defined by design. */
export const hostSchema = z.looseObject({
  name: z.string().min(1),
  runner: z.looseObject({
    module: z.string(),
    port: z.number().int().positive().optional(),
    https: z.boolean().optional(),
    openBrowser: z.boolean().optional(),
    plugins: z.string().optional(),
  }),
  config: z.looseObject({}).optional(),
  profile: profileSchema,
  reactor: reactorSchema.optional(),
});

/** The studio arg surface is wide (commonArgs + server args); the service only
 * reads a known subset, and the repo's own tests build these objects the same
 * way (Partial + cast — see connect-build.test.ts `mk()`). */
function toStudioArgs(host: HostDefinition): ConnectStudioArgs {
  const runner = host.runner;
  const args: Partial<ConnectStudioArgs> = {
    port:
      typeof runner.port === "number"
        ? runner.port
        : DEFAULT_CONNECT_STUDIO_PORT,
    open: runner.openBrowser === true,
    strictPort: runner.strictPort === true,
    printUrls: true,
    bindCLIShortcuts: false,
  };
  return args as ConnectStudioArgs;
}

/** Merge the reactor-block projection (protocol → connect.reactor,
 * backend kind → instance.reactorWorker, workflows → app.workflowsEnabled)
 * into the host's connect config, which rides the studio caller-override.
 * The host config wins on conflict (an explicit connect.* value is intent). */
function callerOverride(
  host: HostDefinition,
): PHConnectRuntimeConfig | undefined {
  const base = (host.config ?? {}) as PHConnectRuntimeConfig;
  const { connect } = projectReactorToConnect(host.reactor as ReactorConfig);
  if (!connect.reactor && !connect.instance && !connect.app) {
    return host.config as PHConnectRuntimeConfig | undefined;
  }
  return {
    ...base,
    reactor: { ...connect.reactor, ...base.reactor },
    instance: { ...connect.instance, ...base.instance } as never,
    app: { ...connect.app, ...base.app },
  };
}

export async function dev(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  const { runConnectStudio } = await import("../services/connect-studio.js");
  await runConnectStudio(toStudioArgs(host), undefined, callerOverride(host));
}

/** `run` is dev-studio until the plugin phases give hosts a production
 * runtime; `serve` (below) is the static production server. */
export const run = dev;

/** P3.3 — `build`: the SAME service as classic `ph connect build`. */
export async function build(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  const { runConnectBuild } = await import("../services/connect-build.js");
  const runner = host.runner;
  const args: Partial<ConnectBuildArgs> = {
    outDir: typeof runner.outDir === "string" ? runner.outDir : "dist",
  };
  await runConnectBuild(args as ConnectBuildArgs);
}

/** P3.3 — `serve`: the SAME vite preview server as classic
 * `ph connect preview` (static serve of a built Connect; run `build` first). */
export async function serve(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  const { runConnectPreview } = await import("../services/connect-preview.js");
  const runner = host.runner;
  const args: Partial<ConnectPreviewArgs> = {
    port:
      typeof runner.port === "number"
        ? runner.port
        : DEFAULT_CONNECT_STUDIO_PORT,
    outDir: typeof runner.outDir === "string" ? runner.outDir : "dist",
    open: runner.openBrowser === true,
    strictPort: runner.strictPort === true,
    cors: true,
    printUrls: true,
    bindCLIShortcuts: false,
  };
  await runConnectPreview(args as ConnectPreviewArgs);
}
