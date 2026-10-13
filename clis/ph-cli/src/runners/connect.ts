import {
  DEFAULT_CONNECT_STUDIO_PORT,
  type PHConnectRuntimeConfig,
} from "@powerhousedao/shared/clis";
import { z } from "zod";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";
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

let warnedReactorBlock = false;

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

export async function dev(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  if (host.reactor && !warnedReactorBlock) {
    warnedReactorBlock = true;
    console.warn(
      "[ph run] the host's `reactor` block is not applied yet (phase 0 bridge); " +
        "projection lands with the reactor-config phase.",
    );
  }
  const { runConnectStudio } = await import("../services/connect-studio.js");
  await runConnectStudio(
    toStudioArgs(host),
    undefined,
    host.config as PHConnectRuntimeConfig | undefined,
  );
}

/** Phase 0: `run` is dev-studio — the only mode the bridge covers. */
export const run = dev;
