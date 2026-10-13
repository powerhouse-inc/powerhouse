import {
  DEFAULT_SWITCHBOARD_PORT,
  DEFAULT_VETRA_DRIVE_ID,
} from "@powerhousedao/shared/clis";
import {
  profileSchema,
  reactorSchema,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { applyReactorEnvProjection } from "./reactor-env.js";
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

/** The slug of the drive the switchboard creates by default
 * (apps/switchboard config); `runner.driveSlug` overrides. */
const DEFAULT_DRIVE_SLUG = "powerhouse";

/** Poll the default drive endpoint until the server answers — the compound's
 * readiness gate: Connect auto-connects the drive on first load, so the drive
 * must answer before the connect member serves (the sidecar's
 * waitForSwitchboard, moved behind the handle contract). */
async function waitForDrive(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Switchboard drive ${url} did not answer within ${timeoutMs}ms.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/** What a started switchboard reports to a supervising compound: its port and
 * the drive it serves (projected into a connect member's defaultDrives). */
export interface SwitchboardHandle {
  port: number;
  driveUrls: string[];
  endpoints: Record<string, string>;
  ready: Promise<void>;
}

async function start(
  host: HostDefinition,
  devMode: boolean,
): Promise<SwitchboardHandle> {
  const options = applyReactorEnvProjection(
    host.reactor as ReactorConfig | undefined,
    `hosts/${host.name}/host.js`,
  );
  const { startSwitchboard } = await import("../services/switchboard.js");
  const args = toSwitchboardArgs(host, devMode, options.dbPath);
  await startSwitchboard(args);
  const port = args.port;
  const slug =
    typeof host.runner.driveSlug === "string"
      ? host.runner.driveSlug
      : DEFAULT_DRIVE_SLUG;
  const driveUrl = `http://localhost:${port}/d/${slug}`;
  const ready = waitForDrive(driveUrl, 180_000);
  // A supervisor awaits `ready` and sees the rejection; an unsupervised caller
  // (or a test with the service mocked) must not die of an unhandled one.
  ready.catch(() => undefined);
  return {
    port,
    driveUrls: [driveUrl],
    endpoints: { graphql: `http://localhost:${port}/graphql` },
    ready,
  };
}

export async function run(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<SwitchboardHandle> {
  return start(host, false);
}

export async function dev(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<SwitchboardHandle> {
  return start(host, true);
}
