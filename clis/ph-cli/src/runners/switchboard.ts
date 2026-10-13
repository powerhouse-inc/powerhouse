import {
  DEFAULT_SWITCHBOARD_PORT,
  DEFAULT_VETRA_DRIVE_ID,
} from "@powerhousedao/shared/clis";
import {
  assertProtocolConsistency,
  profileSchema,
  projectReactorToSwitchboard,
  reactorSchema,
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

/** Phase-2 schema (D2.d): `reactor`/`profile` strict via host-core. */
export const hostSchema = z.looseObject({
  name: z.string().min(1),
  runner: z.looseObject({
    module: z.string(),
    port: z.number().int().positive().optional(),
    https: z.boolean().optional(),
    plugins: z.string().optional(),
  }),
  config: z.looseObject({}).optional(),
  profile: profileSchema,
  reactor: reactorSchema.optional(),
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

/**
 * Apply a host's reactor block to the CURRENT process env, the way the
 * in-process switchboard server reads it at boot (D2.c: env derivation
 * immediately before the member starts; sequential boots make this safe).
 * Single-sourcing teeth first: a pre-set env contradicting the protocol block
 * fails loudly. Then set-if-absent, so an operator's explicit (agreeing) env
 * still wins during the transition. Returns the non-env options (dbPath).
 * Also called by the compound bridge for its switchboard member — the vetra
 * path boots the switchboard via startVetra, not via this runner's verbs.
 */
export function applyReactorEnvProjection(
  reactor: ReactorConfig | undefined,
  hostFileLabel: string,
): { dbPath?: string } {
  const { env, options } = projectReactorToSwitchboard(reactor);
  assertProtocolConsistency(reactor?.protocol, process.env, hostFileLabel);
  for (const [name, value] of Object.entries(env)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
  return options;
}

async function start(host: HostDefinition, devMode: boolean): Promise<void> {
  const options = applyReactorEnvProjection(
    host.reactor as ReactorConfig | undefined,
    `hosts/${host.name}/host.js`,
  );
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
