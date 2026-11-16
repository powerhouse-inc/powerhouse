import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import {
  dev as startDev,
  run as startRun,
  type SwitchboardHandle,
  type SwitchboardHostParsed,
  type SwitchboardStores,
} from "@powerhousedao/ph-run/runners/switchboard";
import {
  entryActiveForVerb,
  normalizePluginEntries,
  normalizePluginEntry,
  projectDriveId,
  resolveDriveDeclaration,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { DEFAULT_SWITCHBOARD_PORT } from "@powerhousedao/shared/clis/constants";

export * from "@powerhousedao/ph-run/runners/switchboard";

export const verbs = [
  "run",
  "serve",
  "dev",
  "build",
  "migrate",
  "migrate-status",
  "reset",
];

/** Build the project's reactor package (the SAME service as `ph build`) — what
 * this switchboard serves. Starts no server; orthogonal to run/serve/dev. */
export async function build(
  host: SwitchboardHostParsed,
  _ctx: RunnerContext,
): Promise<void> {
  const { runBuild } = await import("../services/build.js");
  const { buildServiceArgs } = await import("../services/service-args.js");
  // The `ph build` arguments, with the host's output dir over them.
  const classic = await buildServiceArgs();
  await runBuild({
    ...classic,
    outDir: host.runner.outDir ?? classic.outDir,
  });
}

// `migrate`, `migrate-status` and `reset` were `ph switchboard` flags of
// those names until 6.4, and are verbs now: the SAME services, called with
// the same argument shape, against the stores `run` would open for this host. Each
// does its work and returns nothing; no server starts.

/** The stores `run` would open for this host (host file, then env). */
async function storesOf(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): Promise<SwitchboardStores> {
  const { resolveStores } =
    await import("@powerhousedao/ph-run/runners/switchboard");
  return resolveStores(host, ctx);
}

/** This invocation's arguments (`--db-path`, `--yes`), as `run` reads them. */
async function passedOf(host: SwitchboardHostParsed, ctx: RunnerContext) {
  const { invocationArgsOf } =
    await import("@powerhousedao/ph-run/runners/switchboard");
  return invocationArgsOf(ctx, `hosts/${host.name}/host.js`);
}

/** The service migrates one database, the reactor store: `dbPath` names it
 * (`--db-path` over the host's). Unset, the service falls back to the env as
 * it does under `ph switchboard`. */
async function runMigrations(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
  statusOnly: true | undefined,
): Promise<void> {
  const stores = await storesOf(host, ctx);
  const passed = await passedOf(host, ctx);
  const { runSwitchboardMigrations } =
    await import("../services/switchboard-migrate.js");
  await runSwitchboardMigrations({
    dbPath: passed.dbPath ?? stores.reactor,
    statusOnly,
  });
}

/** `ph switchboard --migrate`: run the reactor store's migrations. */
export async function migrate(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): Promise<void> {
  await runMigrations(host, ctx, undefined);
}

/** `ph switchboard --migrate-status`: list them, executed or pending. */
async function migrateStatus(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): Promise<void> {
  await runMigrations(host, ctx, true);
}
export { migrateStatus as "migrate-status" };

const STORE_ENV = [
  "PH_REACTOR_DATABASE_URL",
  "DATABASE_URL",
  "PH_SWITCHBOARD_DATABASE_URL",
  "PH_USER_DATA_DIR",
] as const;

/** The reset service reads the two stores from this process's env (`dbPath`
 * names one location for both), so the host's stores are that env while it
 * runs, and only then. */
async function withStoreEnv(
  stores: SwitchboardStores,
  work: () => Promise<void>,
): Promise<void> {
  const values: Record<(typeof STORE_ENV)[number], string | undefined> = {
    PH_REACTOR_DATABASE_URL: stores.reactor,
    DATABASE_URL: stores.readModel,
    // Already in the two above, where the env set it.
    PH_SWITCHBOARD_DATABASE_URL: undefined,
    PH_USER_DATA_DIR: stores.userDataDir,
  };
  const before = STORE_ENV.map((name) => [name, process.env[name]] as const);
  const set = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  for (const name of STORE_ENV) set(name, values[name]);
  try {
    await work();
  } finally {
    for (const [name, value] of before) set(name, value);
  }
}

/** `ph switchboard --reset`: delete the local PGlite stores, after the
 * service's own confirmation (`--yes` skips it; without a terminal the
 * service refuses unless it is passed). It refuses a Postgres store. */
export async function reset(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): Promise<void> {
  const stores = await storesOf(host, ctx);
  const passed = await passedOf(host, ctx);
  const { resetSwitchboardDatabase } =
    await import("../services/switchboard-reset.js");
  await withStoreEnv(stores, () =>
    resetSwitchboardDatabase({ dbPath: passed.dbPath, yes: passed.yes }),
  );
}

// A switchboard whose composition has the Vetra Studio plugin active is the
// VETRA switchboard (`ph run vetra`): it gets the vetra drive and the studio
// wiring of services/vetra-switchboard.ts. Any
// other switchboard starts exactly as the ph-run runner starts it.

const STUDIO_PLUGIN = "@powerhousedao/vetra-studio/switchboard";
/** The declared slugs of the studio drives (hosts/vetra/host.js). */
const VETRA_DRIVE = "vetra";
const VETRA_PREVIEW_DRIVE = "vetra-preview";
const WORKFLOWS_DRIVE = "workflows";

type StartVerb = (
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
) => Promise<SwitchboardHandle>;

function hasStudioPlugin(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
): boolean {
  return normalizePluginEntries(
    host.runner.plugins ?? [],
    `hosts/${host.name}/host.js`,
  ).some(
    (entry) =>
      entry.module === STUDIO_PLUGIN && entryActiveForVerb(entry, ctx.verb),
  );
}

/** The host with `processorConfig` on its studio plugin entry: the plugin
 * hands it to the server (vetra-studio switchboard.ts). */
function withStudioProcessorConfig(
  host: SwitchboardHostParsed,
  processorConfig: Record<string, unknown>,
): SwitchboardHostParsed {
  return {
    ...host,
    runner: {
      ...host.runner,
      plugins: host.runner.plugins?.map((entry) => {
        const normalized = normalizePluginEntry(entry);
        if (normalized.module !== STUDIO_PLUGIN) return entry;
        const authored = normalized.config.processorConfig as
          | Record<string, unknown>
          | undefined;
        return {
          ...normalized,
          config: {
            ...normalized.config,
            processorConfig: { ...authored, ...processorConfig },
          },
        };
      }),
    },
  };
}

async function startVetraSwitchboard(
  host: SwitchboardHostParsed,
  ctx: RunnerContext,
  start: StartVerb,
): Promise<SwitchboardHandle> {
  const passed = await passedOf(host, ctx);
  const declared = host.reactor?.drives?.find(
    (drive) => drive.slug === VETRA_DRIVE,
  );
  const vetraDrive = declared
    ? resolveDriveDeclaration(ctx.projectRoot, declared)
    : undefined;
  // `--remote-drive`, else a vetra drive the host declares as remote.
  const remoteDrive =
    passed.remoteDrive ??
    (vetraDrive?.kind === "remote" ? vetraDrive.remoteUrl : undefined);
  // The slug the local vetra drive is served under (its project-hashed id).
  const localDriveId =
    vetraDrive?.slug ?? projectDriveId(ctx.projectRoot, VETRA_DRIVE);
  const requestedPort =
    passed.port ?? host.runner.port ?? DEFAULT_SWITCHBOARD_PORT;
  const {
    configureVetraRemoteDrive,
    printVetraSwitchboardUrls,
    vetraProcessorConfigOf,
  } = await import("../services/vetra-switchboard.js");
  const vetraConfig = vetraProcessorConfigOf({
    interactive: passed.interactive ?? false,
    remoteDrive,
    localDriveUrl: `http://localhost:${requestedPort}/d/${localDriveId}`,
    localDriveId,
  });

  const handle = await start(
    withStudioProcessorConfig(host, {
      [VETRA_PROCESSOR_CONFIG_KEY]: vetraConfig,
    }),
    ctx,
  );

  const { origin, drives } = handle.outputs;
  const port = Number(new URL(origin).port);
  const urlOf = (slug: string): string | undefined =>
    slug in drives ? drives[slug].url : undefined;
  // A compound starts Connect after `ready`: the URLs print, and the remote
  // drive's GitHub URL is settled, before it does (the classic order).
  const ready = handle.ready.then(async () => {
    printVetraSwitchboardUrls({
      verbose: false,
      remoteDrive,
      switchboardPort: port,
      // A remote drive is served here under its own id.
      driveUrl: remoteDrive
        ? `${origin}/d/${vetraConfig.driveId}`
        : urlOf(VETRA_DRIVE),
      previewDriveUrl: urlOf(VETRA_PREVIEW_DRIVE),
      workflowsDriveUrl: urlOf(WORKFLOWS_DRIVE),
    });
    if (remoteDrive) {
      await configureVetraRemoteDrive(port, remoteDrive, false);
    }
  });
  // As the ph-run runner's own `ready`: an unsupervised caller must not die
  // of an unhandled rejection.
  ready.catch(() => undefined);
  return { ...handle, ready };
}

function vetraAware(start: StartVerb): StartVerb {
  return (host, ctx) =>
    hasStudioPlugin(host, ctx)
      ? startVetraSwitchboard(host, ctx, start)
      : start(host, ctx);
}

export const run = vetraAware(startRun);

export const serve = run;

export const dev = vetraAware(startDev);
