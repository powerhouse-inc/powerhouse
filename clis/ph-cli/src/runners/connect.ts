import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import {
  projectReactorToConnect,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { z } from "zod";
import type { ConnectStudioArgs } from "../types.js";

/**
 * BRIDGE runner for Connect hosts (uniform-runners phase 0): maps a
 * hosts/connect/host.js definition onto the SAME service the classic
 * `ph connect studio` command calls — no forked behavior. Real verbs
 * (`build`, `serve`) arrive with later phases; their absence here is
 * deliberate and surfaces through the verb-listing error.
 */

export const kind = "reactor";

/** Phase-0 schema: known fields typed, unknown keys tolerated (loose) —
 * strictness lands with the shared reactor/profile schemas in phase 2. */
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
  profile: z.looseObject({}).optional(),
  reactor: z.looseObject({}).optional(),
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

/** Phase 0: `run` is dev-studio — the only mode the bridge covers. */
export const run = dev;
