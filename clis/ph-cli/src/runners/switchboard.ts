import type * as SwitchboardUtils from "@powerhousedao/switchboard/utils";
import {
  defineHostSchemas,
  drivesSchema,
  mergeDrivePlan,
  protocolConflicts,
  resolveDriveDeclaration,
  resolveHostPlugins,
  seedDrives,
  type BootCheckContext,
  type BootIssue,
  type DriveSeederClient,
  type ResolvedDrive,
  type ResolvedPlugin,
  type RunnerContext,
  type RunnerHandle,
} from "@powerhousedao/host-core";
import path from "node:path";
import {
  memberEnvOf,
  memberSwitchboardConfig,
  memberSwitchboardConfigSchema,
  prepareMemberStorage,
  reactorBlockConflicts,
  readModelAsReactorStore,
  switchboardDevMode,
} from "./member-config.js";
import { z } from "zod";
import { classicSwitchboardArgs } from "../services/classic-args.js";
import {
  inspectorProgressSource,
  startProgressDisplay,
} from "../services/run/catch-up-progress.js";
import type { BuildArgs, SwitchboardArgs } from "../types.js";

/**
 * BRIDGE runner for Switchboard hosts (uniform-runners phase 0): maps a
 * hosts/switchboard/host.js definition onto the SAME `startSwitchboard`
 * service the classic command calls. `run` = production loaders, `dev` =
 * Vite package loader (worker pools refused by the server, as always).
 */

export const kind = "reactor";

/** The switchboard host: the host-core reactor host with every runner option
 * this module reads declared (strict: an unknown runner key fails).
 * `config.switchboard` is this member's own switchboard config (auth,
 * inspection, workers, ...); a key the reactor block also sets is refused.
 * One definition, two schemas: `declaredHostSchema` (token-able fields take
 * output tokens; types host files) and `hostSchema` (resolved; checked
 * right before the verb). */
const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema
    .extend({
      runner: s.runnerBaseSchema
        .extend({
          /** 0 binds a port the OS picks; `origin` reports it. */
          port: z.number().int().min(0).max(65535).optional(),
          /** Dev mode without the `dev` verb (the Vite package loader). */
          dev: z.boolean().optional(),
          /** The project package output dir `build` writes (default "dist"). */
          outDir: z.string().min(1).optional(),
        })
        .strict(),
      config: z
        .strictObject({ switchboard: memberSwitchboardConfigSchema.optional() })
        .optional(),
    })
    .superRefine((host, ctx) => {
      for (const message of reactorBlockConflicts(host)) {
        ctx.addIssue({
          code: "custom",
          path: ["config", "switchboard"],
          message,
        });
      }
    }),
);
export const declaredHostSchema = schemas.declaredHostSchema;
export const hostSchema = schemas.hostSchema;

/** What a switchboard host.js author writes. */
export type SwitchboardHost = z.input<typeof declaredHostSchema>;
/** What a verb receives (defaults applied). */
export type SwitchboardHostParsed = z.output<typeof hostSchema>;

/** One drive the switchboard serves: its document id and its URL. */
export const switchboardDriveOutputSchema = z.strictObject({
  id: z.string().min(1),
  url: z.url(),
});

/** What a started switchboard produces. `origin` carries the port the server
 * actually bound. `drives` is keyed by the DECLARED slug (a `projectHash:
 * true` drive is reachable as `vetra`, its URL uses the hashed slug it is
 * served under) and includes plugin-created drives (e.g. `workflows`) and
 * the server's implicit default drive. `endpoints.mcp` is present when MCP
 * is mounted. */
export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({
    graphql: z.url(),
    mcp: z.url().optional(),
  }),
  drives: z.record(z.string(), switchboardDriveOutputSchema),
});
export type SwitchboardOutputs = z.infer<typeof outputsSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/ph-cli/runners/switchboard": {
      host: SwitchboardHost;
      outputs: SwitchboardOutputs;
    };
  }
}

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
  host: SwitchboardHostParsed,
  devMode: boolean,
  composed: boolean,
): Promise<SwitchboardRunnerArgs> {
  const classic = await classicSwitchboardArgs();
  const runner = host.runner;
  return {
    ...classic,
    port: runner.port ?? classic.port,
    dev: switchboardDevMode(devMode, runner) ? true : classic.dev,
    // A declared composition owns the carved switches (R2): the mcp plugin's
    // presence sets it, its absence must deactivate. Classic path: classic.
    mcp: composed ? undefined : classic.mcp,
  };
}

/** The drive the switchboard service creates by default
 * (services/switchboard.ts `defaultSwitchboardOptions.drive`). */
const DEFAULT_DRIVE_SLUG = "powerhouse";

/** The `<slug>` of the server-reported `…/d/<slug>` default drive URL. */
function defaultDriveSlug(url: string | undefined): string {
  const match = url ? /\/d\/([^/?#]+)\/?$/.exec(url) : null;
  return match ? decodeURIComponent(match[1]) : DEFAULT_DRIVE_SLUG;
}

/** A drive in the plan with the slug its declaration used (a `projectHash:
 * true` drive is served under its hashed slug; outputs key it by this one). */
interface PlannedDrive {
  declaredSlug: string;
  drive: ResolvedDrive;
}

/**
 * The drives the composition's plugins contribute, resolved and in plan
 * order, minus the slugs the host declares itself (mergeDrivePlan: the host
 * file wins). A contribution that is not a valid drive declaration fails the
 * boot naming the plugin.
 */
function pluginDrives(
  projectRoot: string,
  hostDrives: readonly PlannedDrive[],
  composition: readonly ResolvedPlugin[] | undefined,
  where: string,
): PlannedDrive[] {
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
  // served slug -> declared slug, for the outputs' keys
  const declaredSlugs = new Map(
    contributed.map(({ declaration }) => [
      resolveDriveDeclaration(projectRoot, declaration).slug,
      declaration.slug,
    ]),
  );
  const hostSlugs = new Set(hostDrives.map((d) => d.drive.slug));
  return mergeDrivePlan(projectRoot, [], contributed)
    .map((entry) => entry.drive)
    .filter((drive) => !hostSlugs.has(drive.slug))
    .map((drive) => ({
      declaredSlug: declaredSlugs.get(drive.slug) ?? drive.slug,
      drive,
    }));
}

/** Poll the default drive endpoint until the server answers — the compound's
 * readiness gate: Connect auto-connects the drive on first load, so the drive
 * must answer before the connect member serves (the sidecar's
 * waitForSwitchboard, moved behind the handle contract).
 *
 * The probe is anonymous, and a host with authentication on hides a drive
 * from a caller it refuses (`/d/:drive` answers 404 to anyone who may not
 * read it, 401 under the authenticated-caller floor). Those answers prove
 * the server is listening but not whether the drive exists, so `served`,
 * the reactor's own view of the drive, decides then; without it an
 * ADMIN_ONLY host never passes this gate and the compound tears down after
 * the timeout. */
export async function waitForDrive(
  url: string,
  timeoutMs: number,
  served?: () => Promise<boolean>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const HIDDEN = new Set([401, 403, 404]);
  for (;;) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
      if (HIDDEN.has(res.status) && served && (await served())) return;
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

/** What a started switchboard returns. */
export type SwitchboardHandle = RunnerHandle<SwitchboardOutputs>;

/** The slice of the switchboard's reactor client (IReactorClient) the seeder
 * reads: id-or-slug resolution against the read model (live documents). */
interface SlugLookupClient {
  resolveIdOrSlug(identifier: string): Promise<string | undefined>;
}

/**
 * Adapter from the switchboard's reactor client onto the host-core seeder.
 * Seeding is SLUG-keyed: a live drive that already serves the slug — under
 * whatever id (a store from a run that hashed the project path differently,
 * or a hand-made drive) — is the drive, and nothing is created. addDefaultDrive
 * alone only knows ids: with a different id it would try to create a second
 * drive for the slug, and against a deleted document with that id the create
 * fails on every boot.
 */
function seederClient(
  reactor: unknown,
  port: number,
  seededIds: Map<string, string>,
): DriveSeederClient {
  return {
    findDriveBySlug: async (slug: string) => {
      try {
        const id = await (reactor as SlugLookupClient).resolveIdOrSlug(slug);
        if (id) seededIds.set(slug, id);
        return id || undefined;
      } catch {
        // not found (or ambiguous): seed as declared
        return undefined;
      }
    },
    createDrive: async (drive: ResolvedDrive) => {
      const { addDefaultDrive } =
        await import("@powerhousedao/switchboard/utils");
      // One drive that cannot be made must not keep the server from starting
      try {
        await createDeclaredDrive(addDefaultDrive, reactor, drive, port);
      } catch (error) {
        console.error(
          `The drive "${drive.slug}" was not created: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      // Its id: the declared one, or a new one where the store could not take
      // a pinned id (addDefaultDrive then made it under the slug)
      let id: string | undefined;
      try {
        id = await (reactor as SlugLookupClient).resolveIdOrSlug(drive.slug);
      } catch {
        id = undefined;
      }
      seededIds.set(drive.slug, id || drive.id);
    },
    attachRemoteDrive: () => Promise.resolve(), // remotes ride options.remoteDrives
  };
}

/** A declared local drive, through the switchboard's own default-drive path. */
async function createDeclaredDrive(
  addDefaultDrive: typeof SwitchboardUtils.addDefaultDrive,
  reactor: unknown,
  drive: ResolvedDrive,
  port: number,
): Promise<void> {
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
}

async function start(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
  devMode: boolean,
): Promise<SwitchboardHandle> {
  const hostFile = `hosts/${host.name}/host.js`;
  // Split before the server import loads the project .env into the env.
  const env = memberEnvOf(ctx.env);
  prepareMemberStorage(host.reactor, env.shell, hostFile);
  const legacyStore = readModelAsReactorStore(
    host.reactor,
    env.shell,
    hostFile,
  );
  if (legacyStore) console.warn(legacyStore.warning);
  const { startSwitchboard } = await import("../services/switchboard.js");
  const entries = host.runner.plugins;
  const entriesDeclared = entries !== undefined;
  const classic = await toSwitchboardArgs(host, devMode, entriesDeclared);
  // powerhouse.config.json `reactor.https` is a default, not a flag: it goes
  // under the member's own config instead of over it.
  const { https } = classic;
  const args = { ...classic, https: undefined };
  // This member's own config, under the args: nothing is written to the
  // process env, so compound members do not see each other's settings.
  const memberConfig = await memberSwitchboardConfig(host, env, {
    pluginHost: entriesDeclared,
    defaults: https === undefined ? {} : { server: { https } },
  });

  // R2 step 2: a declared composition activates the plugin pipeline — the
  // runner resolves the entries against the PROJECT dependency tree and
  // `features.pluginHost` drives server-side activation. No plugins key =
  // classic path.
  let pluginComposition;
  if (entries !== undefined) {
    pluginComposition = await resolveHostPlugins(
      ctx.projectRoot,
      "switchboard",
      ctx.verb,
      entries,
      `hosts/${host.name}/host.js`,
    );
  }

  // Core drive declarations (reactor.drives): locals seed after boot via the
  // host-core seeder; remotes ride the existing remoteDrives option; the
  // implicit default powerhouse drive is replaced by the declared set.
  const hostDrives: PlannedDrive[] = (host.reactor?.drives ?? []).map(
    (declaration) => ({
      declaredSlug: declaration.slug,
      drive: resolveDriveDeclaration(ctx.projectRoot, declaration),
    }),
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
  const planned = [...hostDrives, ...contributedDrives];
  const resolvedDrives = planned.map((p) => p.drive);
  const remoteDrives = resolvedDrives.flatMap((d) =>
    d.kind === "remote" && d.remoteUrl ? [d.remoteUrl] : [],
  );
  const serverArgs = {
    ...args,
    ...(pluginComposition ? { pluginComposition } : {}),
    // Only the HOST's declarations replace the implicit default drive; a
    // contribution adds to whatever the host serves.
    ...(hostDrives.length > 0 ? { drive: undefined } : {}),
    ...(remoteDrives.length > 0 ? { remoteDrives } : {}),
    // A compound member: the compound owns SIGINT/SIGTERM and the exit, and
    // stops this reactor through the handle's shutdown().
    ...(ctx.parent ? { signalHandlers: false } : {}),
  };

  // `/ready` waits until the drives seeded below exist.
  let seeded!: { resolve: () => void; reject: (error: unknown) => void };
  const readyAfter = new Promise<void>((resolve, reject) => {
    seeded = { resolve, reject };
  });
  const seeding = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      seeded.reject(error);
      throw error;
    }
  };
  const switchboard = await startSwitchboard(
    { ...serverArgs, readyAfter },
    undefined,
    memberConfig,
  );
  // Bars for processor and read-model catch-up, below the server's output;
  // PH_CATCH_UP_PROGRESS=false leaves the output as it was.
  const progress =
    switchboard.inspector && process.env.PH_CATCH_UP_PROGRESS !== "false"
      ? startProgressDisplay(inspectorProgressSource(switchboard.inspector), {
          stdout: process.stdout,
          stderr: process.stderr,
        })
      : undefined;
  // The port the server actually bound (it may move off a taken one).
  const port = switchboard.port;
  const origin = `http://localhost:${port}`;
  const driveUrlOf = (slug: string) => `${origin}/d/${slug}`;

  const seededIds = new Map<string, string>();
  const localPlanned = planned.filter((p) => p.drive.kind === "local");
  if (localPlanned.length > 0) {
    await seeding(
      seedDrives(
        seederClient(switchboard.reactor, port, seededIds),
        localPlanned.map((p) => p.drive),
      ),
    );
  }

  const drives: SwitchboardOutputs["drives"] = {};
  // The server creates its implicit default drive only when nothing replaces
  // it: no host declaration and no remote drive (services/switchboard.ts).
  const localHostDrives = hostDrives.filter((d) => d.drive.kind === "local");
  const defaultSlug = defaultDriveSlug(switchboard.defaultDriveUrl);
  if (hostDrives.length === 0 && remoteDrives.length === 0) {
    drives[defaultSlug] = { id: defaultSlug, url: driveUrlOf(defaultSlug) };
  }
  for (const { declaredSlug, drive } of localPlanned) {
    drives[declaredSlug] = {
      id: seededIds.get(drive.slug) ?? drive.id,
      url: driveUrlOf(drive.slug),
    };
  }

  const slug =
    localHostDrives.length > 0 ? localHostDrives[0].drive.slug : defaultSlug;
  const driveUrl = driveUrlOf(slug);

  // No composition declared (the deprecated `reactor.workflows` switch): the
  // workflows flag still seeds the SAME project-hashed drive the classic
  // vetra path seeds. With a composition the workflows PLUGIN declares that
  // drive (contributions.drives above), so nothing implicit happens here.
  if (entries === undefined && switchboard.workflowsEnabled) {
    const { seedWorkflowsDrive } = await import("../services/vetra.js");
    const { generateProjectDriveId } = await import("../utils.js");
    const url = await seeding(seedWorkflowsDrive(switchboard.reactor, port));
    if (url)
      drives.workflows = { id: generateProjectDriveId("workflows"), url };
  }
  seeded.resolve();

  // Under an authenticating host the anonymous probe cannot see the drive;
  // the reactor's slug lookup (the seeder's) answers for it.
  const served = async () => {
    try {
      const id = await (
        switchboard.reactor as SlugLookupClient
      ).resolveIdOrSlug(slug);
      return Boolean(id);
    } catch {
      return false;
    }
  };
  const ready = waitForDrive(driveUrl, 180_000, served);
  // A supervisor awaits `ready` and sees the rejection; an unsupervised caller
  // (or a test with the service mocked) must not die of an unhandled one.
  ready.catch(() => undefined);
  const graphql = `${origin}/graphql`;
  // Stops the reactor the server owns, then drains the HTTP server (freeing
  // the port), GraphQL, MCP, attachments, the plugins' onShutdown and the
  // read-model db, then closes the reactor database. SwitchboardReactor
  // memoizes it; standalone, SIGINT/SIGTERM run the same teardown, so a
  // shutdown() during or after a signal joins it instead of draining twice.
  let stopping: Promise<void> | undefined;
  return {
    outputs: outputsSchema.parse({
      origin,
      endpoints: {
        graphql,
        ...(switchboard.mcpEnabled ? { mcp: `${origin}/mcp` } : {}),
      },
      drives,
    }),
    ready,
    shutdown: () => {
      progress?.stop();
      return (stopping ??= switchboard.shutdown());
    },
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
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): Promise<SwitchboardHandle> {
  return start(host, ctx, false);
}

export const serve = run;

export async function dev(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): Promise<SwitchboardHandle> {
  return start(host, ctx, true);
}

/** What the server would refuse at boot for this host, `ctx.verb` and `ctx.env` (`ph host check`). */
export async function checkBoot(
  host: SwitchboardHostParsed,
  ctx: BootCheckContext,
): Promise<BootIssue[]> {
  // As `start` splits it: the project .env sits under the host file.
  const env = memberEnvOf(ctx.env, ctx.projectRoot);
  const issues: BootIssue[] = protocolConflicts(
    host.reactor?.protocol,
    env.shell,
    ctx.file,
  ).map((message) => ({ path: "reactor.protocol", message }));
  const legacyStore = readModelAsReactorStore(
    host.reactor,
    env.shell,
    ctx.file,
  );
  if (legacyStore) {
    issues.push({ path: "reactor.backends", message: legacyStore.warning });
  }
  const { getConfig } = await import("@powerhousedao/config/node");
  const { switchboardBootFactsOf, switchboardBootIssues } =
    await import("@powerhousedao/switchboard/boot");
  let config;
  try {
    // As `start` builds it; an env parse error becomes the issue.
    config = await memberSwitchboardConfig(host, env, {
      pluginHost: host.runner.plugins !== undefined,
    });
  } catch (error) {
    issues.push({
      path: "",
      message: error instanceof Error ? error.message : String(error),
    });
    return issues;
  }
  const facts = await switchboardBootFactsOf(config, {
    // As the `dev` verb starts it.
    dev: switchboardDevMode(ctx.verb === "dev", host.runner),
    configuredRenown: getConfig(
      path.join(ctx.projectRoot, "powerhouse.config.json"),
    ).auth?.renown,
  });
  for (const message of switchboardBootIssues(facts)) {
    issues.push({ path: "", message });
  }
  return issues;
}

/** Build the project's reactor package (the SAME service as `ph build`) — what
 * this switchboard serves. Starts no server; orthogonal to run/serve/dev. */
export async function build(
  host: SwitchboardHostParsed,
  _ctx: RunnerContext,
): Promise<void> {
  const { runBuild } = await import("../services/build.js");
  const args: Partial<BuildArgs> = {
    outDir: host.runner.outDir ?? "dist",
  };
  await runBuild(args as BuildArgs);
}
