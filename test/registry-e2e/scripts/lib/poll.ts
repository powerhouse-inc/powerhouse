import { randomUUID } from "node:crypto";
import { sleep } from "./sh.js";

/** Somewhere to read from: NGINX, one replica, or the public URL. */
export interface Target {
  name: string;
  base: string;
  /** Add a unique query parameter so NGINX forwards every read. */
  bust?: boolean;
  /** Reads per round; above 1 samples several pods behind one URL. */
  reads?: number;
}

export interface Endpoint {
  key: string;
  path: string;
  /** For `/pieces/<name>`: only this `version` in the body counts as ok. */
  expectVersion?: string;
}

export interface Sample {
  at: number;
  status: number;
  ms: number;
  version?: string;
  cache?: string;
  upstream?: string;
  error?: string;
}

export function urlOf(target: Target, path: string): string {
  if (!target.bust) return `${target.base}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${target.base}${path}${sep}_cb=${randomUUID()}`;
}

export async function probe(url: string, timeoutMs = 60_000): Promise<Sample> {
  const at = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const type = res.headers.get("content-type") ?? "";
    let version: string | undefined;
    if (type.includes("json")) {
      const body = (await res.json().catch(() => undefined)) as
        | { version?: unknown }
        | undefined;
      if (body && typeof body.version === "string") version = body.version;
    } else {
      await res.arrayBuffer();
    }
    return {
      at,
      status: res.status,
      ms: Date.now() - at,
      ...(version ? { version } : {}),
      ...(res.headers.get("x-cache-status")
        ? { cache: res.headers.get("x-cache-status")! }
        : {}),
      ...(res.headers.get("x-upstream")
        ? { upstream: res.headers.get("x-upstream")! }
        : {}),
    };
  } catch (err) {
    return { at, status: 0, ms: Date.now() - at, error: String(err) };
  }
}

interface Series {
  target: string;
  endpoint: string;
  expectVersion?: string;
  firstOkAt?: number;
  lastOk?: boolean;
  /** An ok read followed by a read that is not. */
  flips: number;
  reads: number;
  okReads: number;
  statuses: Partial<Record<string, number>>;
  versions: Partial<Record<string, number>>;
  maxMs: number;
  /** Status or version changes, in order. */
  changes: {
    at: number;
    status: number;
    version?: string;
    upstream?: string;
  }[];
}

export interface SeriesSummary {
  target: string;
  endpoint: string;
  expectVersion?: string;
  /** Ms from `since` to the first ok read; null when never ok. */
  firstOkMs: number | null;
  flips: number;
  reads: number;
  okReads: number;
  statuses: Partial<Record<string, number>>;
  versions: Partial<Record<string, number>>;
  maxMs: number;
  changes: { t: number; status: number; version?: string; upstream?: string }[];
}

export interface PollResult {
  since: number;
  durationMs: number;
  /** Ms from `since` until every series had been ok once; null if never. */
  allOkMs: number | null;
  series: SeriesSummary[];
}

export interface PollOptions {
  targets: Target[];
  endpoints: Endpoint[];
  /** Time zero for the reported delays, usually the publish. */
  since: number;
  timeoutMs: number;
  /** Keep reading this long after every series was ok, to catch flips. */
  holdMs: number;
  intervalMs?: number;
  /** Called once per round, e.g. to restart a replica mid-poll. */
  onRound?: (elapsedMs: number) => Promise<void> | void;
  /** Stop only on the timeout, even once everything is ok. */
  fullDuration?: boolean;
}

const MAX_CHANGES = 300;

function isOk(sample: Sample, expectVersion?: string): boolean {
  if (sample.status !== 200) return false;
  return expectVersion === undefined || sample.version === expectVersion;
}

export async function poll(options: PollOptions): Promise<PollResult> {
  const { targets, endpoints, since, timeoutMs, holdMs } = options;
  const interval = options.intervalMs ?? 1000;
  const series = new Map<string, Series>();
  for (const target of targets) {
    for (const endpoint of endpoints) {
      series.set(`${target.name}|${endpoint.key}`, {
        target: target.name,
        endpoint: endpoint.key,
        ...(endpoint.expectVersion
          ? { expectVersion: endpoint.expectVersion }
          : {}),
        flips: 0,
        reads: 0,
        okReads: 0,
        statuses: {},
        versions: {},
        maxMs: 0,
        changes: [],
      });
    }
  }
  const started = Date.now();
  let allOkAt: number | undefined;
  for (;;) {
    const roundStart = Date.now();
    await options.onRound?.(roundStart - started);
    await Promise.all(
      targets.flatMap((target) =>
        endpoints.flatMap((endpoint) =>
          Array.from({ length: target.reads ?? 1 }, async () => {
            const sample = await probe(urlOf(target, endpoint.path));
            const s = series.get(`${target.name}|${endpoint.key}`)!;
            const ok = isOk(sample, endpoint.expectVersion);
            s.reads++;
            s.statuses[sample.status] = (s.statuses[sample.status] ?? 0) + 1;
            if (sample.version) {
              s.versions[sample.version] =
                (s.versions[sample.version] ?? 0) + 1;
            }
            s.maxMs = Math.max(s.maxMs, sample.ms);
            if (ok) {
              s.okReads++;
              s.firstOkAt ??= sample.at;
            } else if (s.lastOk) {
              s.flips++;
            }
            const prev = s.changes.at(-1);
            if (
              s.changes.length < MAX_CHANGES &&
              (!prev ||
                prev.status !== sample.status ||
                prev.version !== sample.version)
            ) {
              s.changes.push({
                at: sample.at,
                status: sample.status,
                ...(sample.version ? { version: sample.version } : {}),
                ...(sample.upstream ? { upstream: sample.upstream } : {}),
              });
            }
            s.lastOk = ok;
          }),
        ),
      ),
    );
    const now = Date.now();
    if (!allOkAt && [...series.values()].every((s) => s.firstOkAt)) {
      allOkAt = now;
    }
    if (now - started >= timeoutMs) break;
    if (!options.fullDuration && allOkAt && now - allOkAt >= holdMs) break;
    await sleep(Math.max(0, interval - (Date.now() - roundStart)));
  }
  return {
    since,
    durationMs: Date.now() - started,
    allOkMs: allOkAt
      ? Math.max(...[...series.values()].map((s) => s.firstOkAt! - since))
      : null,
    series: [...series.values()].map((s) => ({
      target: s.target,
      endpoint: s.endpoint,
      ...(s.expectVersion ? { expectVersion: s.expectVersion } : {}),
      firstOkMs: s.firstOkAt ? s.firstOkAt - since : null,
      flips: s.flips,
      reads: s.reads,
      okReads: s.okReads,
      statuses: s.statuses,
      versions: s.versions,
      maxMs: s.maxMs,
      changes: s.changes.map(({ at, ...rest }) => ({ t: at - since, ...rest })),
    })),
  };
}
