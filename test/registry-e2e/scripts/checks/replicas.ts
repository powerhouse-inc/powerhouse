// Replica churn and cold start: replace a replica with an empty /data, as a
// rollout or scale-up does, and time what its first readers get.
import { pieceEndpoints, pkgPrefix, type Context } from "../lib/context.js";
import type { Endpoint } from "../lib/poll.js";
import { poll, probe, type PollResult, type Sample } from "../lib/poll.js";
import { REPLICA_URL, waitReady, type Replica } from "../lib/stack.js";
import { log, sleep } from "../lib/sh.js";
import { readListings } from "./package-list.js";

export interface FirstRead extends Sample {
  endpoint: string;
}

export interface Replacement {
  replica: Replica;
  /** From `docker compose up` to `/-/ping` answering. */
  readyMs: number;
  /** Requests made right after ready, in order. */
  firstReads: FirstRead[];
  /** Listings on the new replica right after its first reads. */
  listingsMissing?: Record<string, string[]>;
}

export interface ChurnResult {
  /** NGINX and the other replicas while one is replaced. */
  during: PollResult;
  replacement: Replacement;
  /** The new replica over the following seconds. */
  after: PollResult;
}

export interface ColdStartResult {
  /** First reads the moment the port answers. */
  immediate: Replacement;
  /** First reads after one `/packages` request, as the readiness probe sends. */
  afterProbe: Replacement;
}

async function firstReads(
  base: string,
  endpoints: Endpoint[],
): Promise<FirstRead[]> {
  const reads: FirstRead[] = [];
  for (const endpoint of endpoints) {
    const sample = await probe(`${base}${endpoint.path}`, 120_000);
    reads.push({ endpoint: endpoint.key, ...sample });
    log(
      `  first ${endpoint.key}: ${sample.status} in ${sample.ms} ms${sample.version ? ` (version ${sample.version})` : ""}`,
    );
  }
  return reads;
}

async function replace(
  ctx: Context,
  replica: Replica,
  endpoints: Endpoint[],
  options: { probeFirst?: boolean; expected?: string[] } = {},
): Promise<Replacement> {
  const { startedAt } = await ctx.stack!.recreate(replica);
  const readyAt = await waitReady(REPLICA_URL[replica]);
  log(`replaced ${replica}: ready ${readyAt - startedAt} ms after start`);
  if (options.probeFirst) {
    await probe(`${REPLICA_URL[replica]}/packages`);
    // The readiness probe's period before traffic arrives.
    await sleep(5000);
  }
  const reads = await firstReads(REPLICA_URL[replica], endpoints);
  const result: Replacement = {
    replica,
    readyMs: readyAt - startedAt,
    firstReads: reads,
  };
  if (options.expected) {
    const seen = await readListings(
      { name: replica, base: REPLICA_URL[replica] },
      options.expected,
      pkgPrefix(ctx.runId),
    );
    result.listingsMissing = Object.fromEntries(
      Object.entries(seen).map(([listing, names]) => [
        listing,
        options.expected!.filter((n) => !names.has(n)),
      ]),
    );
  }
  return result;
}

export async function churn(
  ctx: Context,
  piece: string,
  version: string,
  expected: string[],
): Promise<ChurnResult> {
  const endpoints = pieceEndpoints(piece, version, {
    latest: true,
    expectLatest: version,
  });
  const replaced: Replica = "registry-3";
  const others = ctx.targets.filter((t) => t.name !== replaced);
  log(`churn: replacing ${replaced} while reading ${piece}`);
  const since = Date.now();
  const during = poll({
    targets: others,
    endpoints,
    since,
    timeoutMs: 60_000,
    holdMs: 0,
    intervalMs: ctx.timing.intervalMs,
    fullDuration: true,
  });
  await sleep(5000);
  const replacement = await replace(ctx, replaced, endpoints, { expected });
  const duringResult = await during;
  const after = await poll({
    targets: ctx.targets.filter((t) => t.name === replaced),
    endpoints,
    since: Date.now(),
    timeoutMs: 20_000,
    holdMs: 0,
    intervalMs: ctx.timing.intervalMs,
    fullDuration: true,
  });
  return { during: duringResult, replacement, after };
}

export async function coldStart(
  ctx: Context,
  piece: string,
  version: string,
): Promise<ColdStartResult> {
  const endpoints = pieceEndpoints(piece, version, { latest: true });
  log("cold start: first reads the moment the port answers");
  const immediate = await replace(ctx, "registry-2", endpoints);
  log("cold start: first reads after a readiness-style /packages request");
  const afterProbe = await replace(ctx, "registry-2", endpoints, {
    probeFirst: true,
  });
  return { immediate, afterProbe };
}
