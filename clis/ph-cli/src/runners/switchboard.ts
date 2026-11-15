import type {
  SwitchboardHostParsed,
  SwitchboardStores,
} from "@powerhousedao/ph-run/runners/switchboard";
import type { RunnerContext } from "@powerhousedao/host-core";
import type { BuildArgs } from "../types.js";

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
  const args: Partial<BuildArgs> = {
    outDir: host.runner.outDir ?? "dist",
  };
  await runBuild(args as BuildArgs);
}

// `migrate`, `migrate-status` and `reset` are the classic `ph switchboard`
// flags of those names as verbs: the SAME services, called with the classic
// argument shape, against the stores `run` would open for this host. Each
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
