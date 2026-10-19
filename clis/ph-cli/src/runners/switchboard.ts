import {
  profileSchema,
  reactorSchema,
  type HostDefinition,
  type ReactorConfig,
  type RunnerContext,
} from "@powerhousedao/host-core";
import {
  drivesSchema,
  mergeDrivePlan,
  pluginEntrySchema,
  resolveDriveDeclaration,
  resolveHostPlugins,
  seedDrives,
  type DriveDeclaration,
  type DriveSeederClient,
  type ResolvedDrive,
  type ResolvedPlugin,
} from "@powerhousedao/host-core";
import { applyReactorEnvProjection } from "./reactor-env.js";
import { z } from "zod";
import { classicSwitchboardArgs } from "../services/classic-args.js";
import type { BuildArgs, SwitchboardArgs } from "../types.js";

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
    // THE COMPOSITION (rewire R2): plugin entries, presence is activation.
    // (The classic packages-CSV meaning of this field is retired — packages
    // load via reactor.backends.*.packages / the package manager.)
    plugins: z.array(pluginEntrySchema).optional(),
  }),
  config: z.looseObject({}).optional(),
  profile: profileSchema,
  reactor: reactorSchema.optional(),
});

/** The classic arg shape with the one switch a composition may leave unset. */
export type SwitchboardRunnerArgs = Omit<SwitchboardArgs, "mcp"> & {
  mcp: boolean | undefined;
};

/**
 * Start from the classic `ph switchboard` args (parsed by the classic
 * definitions, no flags) and overlay ONLY the keys the host file owns. Every
 * other key — including the ones the classic command carries as `undefined`,
 * such as `dbPath` — reaches the service exactly as on the classic path. No
 * cast: a key the classic shape has and this object lacks is a type error.
 */
async function toSwitchboardArgs(
  host: HostDefinition,
  devMode: boolean,
  dbPath: string | undefined,
  composed: boolean,
): Promise<SwitchboardRunnerArgs> {
  const classic = await classicSwitchboardArgs();
  const runner = host.runner;
  return {
    ...classic,
    port: typeof runner.port === "number" ? runner.port : classic.port,
    // The verb owns dev mode; `runner.dev` is the host-file spelling of it.
    dev: devMode || runner.dev === true ? true : classic.dev,
    // A declared composition owns the carved switches (R2): the mcp plugin's
    // presence sets it, its absence must deactivate. Classic path: classic.
    mcp: composed ? undefined : classic.mcp,
    // The host file's readModel.url. Absent, the key stays present and
    // undefined exactly as the classic command carries it, so the server's
    // own split defaults (.ph/reactor-storage + .ph/read-storage) apply.
    // Omitting the key resurrected a dead service default and put the
    // reactor and the read model on ONE PGlite dir (two writers, one PGDATA).
    dbPath: dbPath ?? classic.dbPath,
  };
}

/** The slug of the drive the switchboard creates by default
 * (apps/switchboard config); `runner.driveSlug` overrides. */
const DEFAULT_DRIVE_SLUG = "powerhouse";

/**
 * The drives the composition's plugins contribute, resolved and in plan
 * order, minus the slugs the host declares itself (mergeDrivePlan: the host
 * file wins). A contribution that is not a valid drive declaration fails the
 * boot naming the plugin.
 */
function pluginDrives(
  projectRoot: string,
  hostDrives: readonly ResolvedDrive[],
  composition: readonly ResolvedPlugin[] | undefined,
  where: string,
): ResolvedDrive[] {
  if (!composition) return [];
  const contributed = composition.flatMap((resolved) => {
    const drives = resolved.plugin.contributions?.drives ?? [];
    if (drives.length === 0) return [];
    const parsed = drivesSchema.safeParse(drives);
    if (!parsed.success) {
      throw new Error(
        `${where}: plugin "${resolved.plugin.name}" contributes an invalid drive declaration:\n${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data.map((declaration) => ({
      declaration,
      source: resolved.plugin.name,
    }));
  });
  if (contributed.length === 0) return [];
  const hostSlugs = new Set(hostDrives.map((d) => d.slug));
  return mergeDrivePlan(projectRoot, [], contributed)
    .map((entry) => entry.drive)
    .filter((drive) => !hostSlugs.has(drive.slug));
}

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

/** Adapter from the switchboard's reactor client onto the host-core seeder.
 * addDefaultDrive is slug-idempotent itself, so findDriveBySlug delegates. */
function seederClient(reactor: unknown, port: number): DriveSeederClient {
  return {
    findDriveBySlug: () => Promise.resolve(undefined),
    createDrive: async (drive: ResolvedDrive) => {
      const { addDefaultDrive } =
        await import("@powerhousedao/switchboard/utils");
      await addDefaultDrive(
        reactor as Parameters<typeof addDefaultDrive>[0],
        {
          id: drive.id,
          slug: drive.slug,
          global: { name: drive.name, icon: drive.icon },
          ...(drive.preferredEditor
            ? { preferredEditor: drive.preferredEditor }
            : {}),
          local: {
            availableOffline: drive.availableOffline,
            listeners: [],
            sharingType: drive.sharingType,
            triggers: [],
          },
        } as Parameters<typeof addDefaultDrive>[1],
        port,
      );
    },
    attachRemoteDrive: () => Promise.resolve(), // remotes ride options.remoteDrives
  };
}

async function start(
  host: HostDefinition,
  ctx: RunnerContext,
  devMode: boolean,
): Promise<SwitchboardHandle> {
  const options = applyReactorEnvProjection(
    host.reactor as ReactorConfig | undefined,
    `hosts/${host.name}/host.js`,
  );
  const { startSwitchboard } = await import("../services/switchboard.js");
  const entriesDeclared =
    (host.runner as { plugins?: unknown }).plugins !== undefined;
  const args = await toSwitchboardArgs(
    host,
    devMode,
    options.dbPath,
    entriesDeclared,
  );

  // R2 step 2: a declared composition activates the plugin pipeline — the
  // runner resolves the entries against the PROJECT dependency tree and the
  // flag drives server-side activation. No plugins key = classic path.
  const entries = (host.runner as { plugins?: unknown }).plugins as
    | Parameters<typeof resolveHostPlugins>[3]
    | undefined;
  let pluginComposition;
  if (entries !== undefined) {
    process.env.FEATURE_PLUGIN_HOST_ENABLED = "1";
    pluginComposition = await resolveHostPlugins(
      ctx.projectRoot,
      "switchboard",
      ctx.verb ?? (devMode ? "dev" : "run"),
      entries,
      `hosts/${host.name}/host.js`,
    );
  }

  // Core drive declarations (reactor.drives): locals seed after boot via the
  // host-core seeder; remotes ride the existing remoteDrives option; the
  // implicit default powerhouse drive is replaced by the declared set.
  const declarations = (
    host.reactor as { drives?: DriveDeclaration[] } | undefined
  )?.drives;
  const hostDrives = (declarations ?? []).map((declaration) =>
    resolveDriveDeclaration(ctx.projectRoot, declaration),
  );
  // Plugin-contributed drives (e.g. the workflows plugin's Workflows drive)
  // join the plan after the host's own: a host declaration with the same slug
  // wins, and the host's drives stay first (the first local one is the
  // readiness gate and the compound's primary drive).
  const contributedDrives = pluginDrives(
    ctx.projectRoot,
    hostDrives,
    pluginComposition,
    `hosts/${host.name}/host.js`,
  );
  const resolvedDrives = [...hostDrives, ...contributedDrives];
  const serverArgs = {
    ...args,
    ...(pluginComposition ? { pluginComposition } : {}),
    // Only the HOST's declarations replace the implicit default drive; a
    // contribution adds to whatever the host serves.
    ...(hostDrives.length > 0 ? { drive: undefined } : {}),
    ...(resolvedDrives.some((d) => d.kind === "remote")
      ? {
          remoteDrives: resolvedDrives
            .filter((d) => d.kind === "remote")
            .map((d) => d.remoteUrl!),
        }
      : {}),
  };

  const switchboard = await startSwitchboard(serverArgs);
  const port = args.port;

  const localDrives = resolvedDrives.filter((d) => d.kind === "local");
  if (localDrives.length > 0 && switchboard) {
    await seedDrives(seederClient(switchboard.reactor, port), localDrives);
  }

  const localHostDrives = hostDrives.filter((d) => d.kind === "local");
  const slug =
    localHostDrives.length > 0
      ? localHostDrives[0].slug
      : typeof host.runner.driveSlug === "string"
        ? host.runner.driveSlug
        : DEFAULT_DRIVE_SLUG;
  const driveUrl = `http://localhost:${port}/d/${slug}`;
  const driveUrls = [
    ...(localHostDrives.length > 0 ? [] : [driveUrl]),
    ...localDrives.map((d) => `http://localhost:${port}/d/${d.slug}`),
  ];

  // No composition declared (the deprecated `reactor.workflows` switch): the
  // workflows flag still seeds the SAME project-hashed drive the classic
  // vetra path seeds. With a composition the workflows PLUGIN declares that
  // drive (contributions.drives above), so nothing implicit happens here.
  if (entries === undefined && switchboard?.workflowsEnabled) {
    const { seedWorkflowsDrive } = await import("../services/vetra.js");
    driveUrls.push(await seedWorkflowsDrive(switchboard.reactor, port));
  }

  const ready = waitForDrive(driveUrl, 180_000);
  // A supervisor awaits `ready` and sees the rejection; an unsupervised caller
  // (or a test with the service mocked) must not die of an unhandled one.
  ready.catch(() => undefined);
  return {
    port,
    driveUrls,
    endpoints: { graphql: `http://localhost:${port}/graphql` },
    ready,
  };
}

// The four verbs are orthogonal: each does ONE job.
//  - `run`/`serve`: START the server in production mode (serves the built
//    project package). `serve` is run's alias — a server IS its served stack,
//    and it lets the compound forward one `serve` verb to every member.
//  - `dev`: START the server in dev mode (watch / the Vite package loader).
//  - `build`: PRODUCE the project package this switchboard serves, and start
//    NOTHING. The analog of `ph connect build` on the server side: legacy
//    `ph switchboard build` never existed, but the project still has a build.
// `build` is what lets a compound forward a single `build` verb to all members
// (desktop/cli) without the switchboard member failing on an unknown verb.

export async function run(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<SwitchboardHandle> {
  return start(host, ctx, false);
}

export const serve = run;

export async function dev(
  host: HostDefinition,
  ctx: RunnerContext,
): Promise<SwitchboardHandle> {
  return start(host, ctx, true);
}

/** Build the project's reactor package (the SAME service as `ph build`) — what
 * this switchboard serves. Starts no server; orthogonal to run/serve/dev. */
export async function build(
  host: HostDefinition,
  _ctx: RunnerContext,
): Promise<void> {
  const { runBuild } = await import("../services/build.js");
  const runner = host.runner;
  const args: Partial<BuildArgs> = {
    outDir: typeof runner.outDir === "string" ? runner.outDir : "dist",
  };
  await runBuild(args as BuildArgs);
}
