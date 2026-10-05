// Concurrent publishes of different packages to different replicas: does every
// listing end up with all of them, or does the S3 list lose some?
import { pkgPrefix, type Context } from "../lib/context.js";
import { urlOf, type Target } from "../lib/poll.js";
import {
  probePackage,
  publishProbe,
  type PublishRecord,
} from "../lib/publisher.js";
import { log, sleep } from "../lib/sh.js";

/** Names each listing returned, and when it first held them all. */
export interface ListingSeries {
  target: string;
  listing: "packages" | "verdaccio" | "packument";
  /** Ms from the last publish to the first read that held every name; null if never. */
  completeMs: number | null;
  /** Names missing from the last read. */
  missingAtEnd: string[];
  reads: number;
}

export interface PackageListResult {
  names: string[];
  publishes: PublishRecord[];
  series: ListingSeries[];
  /** The S3 plugin's shared list after the run (Docker only). */
  s3List: string[] | null;
  /** Names published during the whole run that the S3 list lacks. */
  s3Missing: string[] | null;
}

async function names(
  target: Target,
  path: string,
  pick: (body: unknown) => string[],
): Promise<Set<string> | null> {
  try {
    const res = await fetch(urlOf(target, path), {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    return new Set(pick(await res.json()));
  } catch {
    return null;
  }
}

const listingPath = {
  packages: (prefix: string) =>
    `/packages?limit=50&search=${encodeURIComponent(prefix)}`,
  verdaccio: () => "/-/verdaccio/data/packages",
};

const pickPackages = (body: unknown) =>
  ((body as { items?: { name: string }[] }).items ?? []).map((i) => i.name);
const pickVerdaccio = (body: unknown) =>
  Array.isArray(body) ? (body as { name: string }[]).map((p) => p.name) : [];

/** One round of every listing on `target`: names that every read held. */
export async function readListings(
  target: Target,
  expected: string[],
  prefix: string,
): Promise<Record<ListingSeries["listing"], Set<string>>> {
  // Several reads sample several pods; a name one pod lacks counts as missing.
  const inEvery = async (read: () => Promise<Set<string> | null>) => {
    const reads = await Promise.all(
      Array.from({ length: target.reads ?? 1 }, read),
    );
    return new Set(
      expected.filter((n) => reads.every((r) => r?.has(n) ?? false)),
    );
  };
  const [packages, verdaccio, packument] = await Promise.all([
    inEvery(() => names(target, listingPath.packages(prefix), pickPackages)),
    inEvery(() => names(target, listingPath.verdaccio(), pickVerdaccio)),
    inEvery(async () => {
      const found = new Set<string>();
      await Promise.all(
        expected.map(async (name) => {
          const res = await fetch(urlOf(target, `/${name}`), {
            signal: AbortSignal.timeout(60_000),
          }).catch(() => undefined);
          if (res?.ok) found.add(name);
          await res?.arrayBuffer().catch(() => undefined);
        }),
      );
      return found;
    }),
  ]);
  return { packages, verdaccio, packument };
}

export async function packageList(
  ctx: Context,
  count: number,
  alsoExpected: string[],
): Promise<PackageListResult> {
  const prefix = pkgPrefix(ctx.runId);
  const pkgs = Array.from({ length: count }, (_, i) =>
    probePackage(`${prefix}-list${i + 1}`, "1.0.0"),
  );
  log(`package list: publishing ${pkgs.map((p) => p.name).join(", ")} at once`);
  const publishes = await Promise.all(
    pkgs.map((pkg, i) => publishProbe(pkg, ctx.publishUrl(i), ctx.token)),
  );
  const since = Math.max(...publishes.map((p) => p.finishedAt));
  const expected = [
    ...pkgs.filter((_, i) => publishes[i].ok).map((p) => p.name),
    ...alsoExpected,
  ];

  const series = new Map<string, ListingSeries>();
  const key = (t: string, l: string) => `${t}|${l}`;
  for (const target of ctx.listTargets) {
    for (const listing of ["packages", "verdaccio", "packument"] as const) {
      series.set(key(target.name, listing), {
        target: target.name,
        listing,
        completeMs: null,
        missingAtEnd: expected,
        reads: 0,
      });
    }
  }
  const started = Date.now();
  while (Date.now() - started < ctx.timing.listTimeoutMs) {
    const round = Date.now();
    await Promise.all(
      ctx.listTargets.map(async (target) => {
        const seen = await readListings(target, expected, prefix);
        for (const listing of ["packages", "verdaccio", "packument"] as const) {
          const s = series.get(key(target.name, listing))!;
          s.reads++;
          s.missingAtEnd = expected.filter((n) => !seen[listing].has(n));
          if (s.missingAtEnd.length === 0) s.completeMs ??= Date.now() - since;
        }
      }),
    );
    if ([...series.values()].every((s) => s.completeMs !== null)) break;
    await sleep(Math.max(0, ctx.timing.intervalMs * 2 - (Date.now() - round)));
  }

  const s3List = ctx.stack ? await ctx.stack.s3PackageList() : null;
  const s3Missing = s3List ? expected.filter((n) => !s3List.includes(n)) : null;
  log(`package list: S3 list lacks ${s3Missing?.join(", ") || "nothing"}`);
  return {
    names: pkgs.map((p) => p.name),
    publishes,
    series: [...series.values()],
    s3List,
    s3Missing,
  };
}
