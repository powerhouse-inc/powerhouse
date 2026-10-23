import { isPostgresUrl } from "./postgres-url.mjs";

/** What the server refuses to boot with; it throws the first, `ph host check` reports all. */
export interface SwitchboardBootFacts {
  dev: boolean;
  /** Executor pool size; 0 when the pool is off. */
  workers: number;
  projectionWorker: boolean;
  reactorDbUrl: string | undefined;
  authEnforcement: boolean;
  renownSource: "self" | "remote";
}

export function workerTrustPolicyIssue(
  facts: Pick<
    SwitchboardBootFacts,
    "workers" | "authEnforcement" | "renownSource"
  >,
): string | undefined {
  if (
    facts.workers > 0 &&
    facts.authEnforcement &&
    facts.renownSource === "self"
  ) {
    return (
      "The executor worker pool (REACTOR_WORKERS) cannot verify signers when " +
      "REACTOR_AUTH_ENFORCEMENT is on and Renown credentials are read from " +
      'this switchboard ("self" via auth.renown.source or RENOWN_SOURCE): ' +
      "pooled workers have no trust policy and would refuse every signed " +
      "write. Set RENOWN_SOURCE=remote, or disable the worker pool " +
      "(REACTOR_WORKERS=0)."
    );
  }
  return undefined;
}

/** In the order the server checks them; empty when the pool is off. */
export function workerPoolIssues(facts: SwitchboardBootFacts): string[] {
  if (facts.workers <= 0) return [];
  const issues: string[] = [];
  if (facts.dev) {
    issues.push(
      "The executor worker pool (REACTOR_WORKERS) is not supported in dev mode: Vite-loaded document models cannot cross a worker-thread boundary",
    );
  }
  const trust = workerTrustPolicyIssue(facts);
  if (trust) issues.push(trust);
  if (!facts.reactorDbUrl || !isPostgresUrl(facts.reactorDbUrl)) {
    issues.push(
      "The executor worker pool (REACTOR_WORKERS) requires a Postgres reactor database — set PH_REACTOR_DATABASE_URL or PH_SWITCHBOARD_DATABASE_URL. PGlite cannot be shared across worker threads.",
    );
  }
  return issues;
}

/** The projection worker's preconditions, assuming it is enabled. */
export function projectionWorkerIssues(
  facts: Pick<SwitchboardBootFacts, "dev" | "reactorDbUrl">,
): string[] {
  const issues: string[] = [];
  if (facts.dev) {
    issues.push(
      "The projection worker (REACTOR_PROJECTION_WORKER) is not supported in dev mode: Vite-loaded document models cannot cross a worker-thread boundary",
    );
  }
  if (!facts.reactorDbUrl || !isPostgresUrl(facts.reactorDbUrl)) {
    issues.push(
      "The projection worker (REACTOR_PROJECTION_WORKER) requires a Postgres reactor database — set PH_REACTOR_DATABASE_URL or PH_SWITCHBOARD_DATABASE_URL. PGlite cannot be shared across worker threads.",
    );
  }
  return issues;
}

export function switchboardBootIssues(facts: SwitchboardBootFacts): string[] {
  return [
    ...workerPoolIssues(facts),
    ...(facts.projectionWorker ? projectionWorkerIssues(facts) : []),
  ];
}
