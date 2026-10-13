import {
  DEFAULT_SWITCHBOARD_PORT,
  DEFAULT_VETRA_DRIVE_ID,
} from "@powerhousedao/shared/clis";
import { z } from "zod";
import type { HostDefinition } from "../services/run/host-loader.js";
import type { RunnerContext } from "../services/run/runner-resolver.js";
import type { SwitchboardArgs } from "../types.js";

/**
 * BRIDGE runner for Switchboard hosts (uniform-runners phase 0): maps a
 * hosts/switchboard/host.js definition onto the SAME `startSwitchboard`
 * service the classic command calls. `run` = production loaders, `dev` =
 * Vite package loader (worker pools refused by the server, as always).
 * There is deliberately no `build` verb — the switchboard has none.
 */

export const kind = "reactor";

export const hostSchema = z.looseObject({
  name: z.string().min(1),
  runner: z.looseObject({
    module: z.string(),
    port: z.number().int().positive().optional(),
    https: z.boolean().optional(),
    plugins: z.string().optional(),
  }),
  config: z.looseObject({}).optional(),
  profile: z.looseObject({}).optional(),
  reactor: z.looseObject({}).optional(),
});

let warnedReactorBlock = false;

function toSwitchboardArgs(
  host: HostDefinition,
  devMode: boolean,
): SwitchboardArgs {
  const runner = host.runner;
  const args: Partial<SwitchboardArgs> = {
    port:
      typeof runner.port === "number" ? runner.port : DEFAULT_SWITCHBOARD_PORT,
    vetraDriveId: DEFAULT_VETRA_DRIVE_ID,
    mcp: true,
    useVetraDrive: false,
    remoteDrives: [],
    dev: devMode || runner.dev === true,
  };
  return args as SwitchboardArgs;
}

async function start(host: HostDefinition, devMode: boolean): Promise<void> {
  if (host.reactor && !warnedReactorBlock) {
    warnedReactorBlock = true;
    console.warn(
      "[ph run] the host's `reactor` block is not applied yet (phase 0 bridge); " +
        "projection lands with the reactor-config phase. `auth` is read from " +
        "powerhouse.config.json by the server itself, as before.",
    );
  }
  const { startSwitchboard } = await import("../services/switchboard.js");
  await startSwitchboard(toSwitchboardArgs(host, devMode));
}

export async function run(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  await start(host, false);
}

export async function dev(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  await start(host, true);
}
