import { isPostgresUrl } from "./utils.mjs";
import { parseNonNegativeInt } from "./worker-pool.mjs";

export type SwitchboardProjectionWorkerOptions = {
  dbPoolSize: number;
};

export type SwitchboardProjectionWorkerInput = {
  enabled?: boolean;
  dbPoolSize?: number;
};

// Run 11 of the bench sweep saw chain.depth ~6.5 at one shard, so 8 covers the
// working set; behind a 25-slot transaction pooler a larger pool is not spendable.
const DEFAULT_DB_POOL_SIZE_PROJECTION = 8;

const ON_TOKENS = ["1", "true", "on", "yes"];
const OFF_TOKENS = ["0", "false", "off", "no"];

/**
 * Enabled by REACTOR_PROJECTION_WORKER (1/true/on/yes, case-insensitive) or
 * `input.enabled`, which wins when defined; null when off (the default).
 */
export function resolveProjectionWorkerOptions(
  input: SwitchboardProjectionWorkerInput | undefined,
  env: NodeJS.ProcessEnv,
): SwitchboardProjectionWorkerOptions | null {
  const enabled =
    input?.enabled ?? parseOnOff(env.REACTOR_PROJECTION_WORKER) ?? false;
  if (!enabled) {
    return null;
  }
  const dbPoolSize =
    input?.dbPoolSize ??
    parseNonNegativeInt(
      env.REACTOR_DB_POOL_SIZE_PROJECTION,
      "REACTOR_DB_POOL_SIZE_PROJECTION",
    ) ??
    DEFAULT_DB_POOL_SIZE_PROJECTION;
  if (dbPoolSize < 1) {
    throw new Error(
      "REACTOR_DB_POOL_SIZE_PROJECTION must be at least 1; the projection worker cannot run without a pool",
    );
  }
  return { dbPoolSize };
}

/** Same preconditions as the executor worker pool; message shape mirrors server.mts. */
export function assertProjectionWorkerSupported(args: {
  dev: boolean;
  reactorDbUrl: string | undefined;
}): void {
  if (args.dev) {
    throw new Error(
      "The projection worker (REACTOR_PROJECTION_WORKER) is not supported in dev mode: Vite-loaded document models cannot cross a worker-thread boundary",
    );
  }
  if (!args.reactorDbUrl || !isPostgresUrl(args.reactorDbUrl)) {
    throw new Error(
      "The projection worker (REACTOR_PROJECTION_WORKER) requires a Postgres reactor database — set PH_REACTOR_DATABASE_URL or PH_SWITCHBOARD_DATABASE_URL. PGlite cannot be shared across worker threads.",
    );
  }
}

function parseOnOff(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const token = raw.trim().toLowerCase();
  if (ON_TOKENS.includes(token)) {
    return true;
  }
  if (OFF_TOKENS.includes(token)) {
    return false;
  }
  throw new Error(
    `REACTOR_PROJECTION_WORKER must be one of 1, true, on, yes, 0, false, off, no, got "${raw}"`,
  );
}
