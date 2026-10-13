import {
  DEFAULT_SWITCHBOARD_PORT,
  DEFAULT_VETRA_DRIVE_ID,
} from "@powerhousedao/shared/clis";
import {
  assertProtocolConsistency,
  projectReactorToSwitchboard,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { z } from "zod";
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

function toSwitchboardArgs(
  host: HostDefinition,
  devMode: boolean,
  dbPath: string | undefined,
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
    ...(dbPath ? { dbPath } : {}),
  };
  return args as SwitchboardArgs;
}

async function start(host: HostDefinition, devMode: boolean): Promise<void> {
  const reactor = host.reactor as ReactorConfig | undefined;
  const { env, options } = projectReactorToSwitchboard(reactor);

  // Single-sourcing teeth: a pre-set env contradicting the protocol block
  // fails loudly before anything boots.
  assertProtocolConsistency(
    reactor?.protocol,
    process.env,
    `hosts/${host.name}/host.js`,
  );
  // Transition precedence: set only what the env does not already carry, so an
  // operator's explicit override still wins (contradictions already rejected).
  for (const [name, value] of Object.entries(env)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }

  const { startSwitchboard } = await import("../services/switchboard.js");
  await startSwitchboard(toSwitchboardArgs(host, devMode, options.dbPath));
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
