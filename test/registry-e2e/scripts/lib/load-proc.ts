// One load-generator process: reads its job from stdin, runs it, and prints
// the raw result as JSON, so several can run side by side on separate cores.
import {
  bust,
  picker,
  routePath,
  type Route,
  type RouteStyle,
  type SeedPackage,
} from "./mix.js";

export interface LoadJob {
  bases: string[];
  seeds: SeedPackage[];
  mix: Partial<Record<Route, number>>;
  concurrency: number;
  durationMs: number;
  bustCache: boolean;
  timeoutMs: number;
  style?: RouteStyle;
}

export interface LoadOutput {
  latencies: number[];
  byRoute: Record<string, { ok: number; failed: number }>;
  statuses: Record<string, number>;
  errors: Record<string, number>;
  cpuMs: number;
}

function errorKind(err: unknown): string {
  const e = err as { name?: string; cause?: { code?: string } };
  if (e.name === "TimeoutError" || e.name === "AbortError") return "timeout";
  return e.cause?.code ?? e.name ?? "error";
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const job = JSON.parse(Buffer.concat(chunks).toString()) as LoadJob;
  const pick = picker(job.mix);
  const out: LoadOutput = {
    latencies: [],
    byRoute: {},
    statuses: {},
    errors: {},
    cpuMs: 0,
  };
  const cpuStart = process.cpuUsage();
  const deadline = performance.now() + job.durationMs;
  let turn = 0;

  await Promise.all(
    Array.from({ length: job.concurrency }, async () => {
      while (performance.now() < deadline) {
        const route = pick();
        const seed = job.seeds[Math.floor(Math.random() * job.seeds.length)];
        const path = routePath(route, seed, job.style);
        const base = job.bases[turn++ % job.bases.length];
        const url = `${base}${job.bustCache ? bust(path) : path}`;
        const tally = (out.byRoute[route] ??= { ok: 0, failed: 0 });
        const t0 = performance.now();
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(job.timeoutMs),
          });
          await res.arrayBuffer();
          out.statuses[res.status] = (out.statuses[res.status] ?? 0) + 1;
          if (res.ok || res.status === 304) tally.ok++;
          else tally.failed++;
        } catch (err) {
          const kind = errorKind(err);
          out.errors[kind] = (out.errors[kind] ?? 0) + 1;
          tally.failed++;
        }
        out.latencies.push(Math.round((performance.now() - t0) * 10) / 10);
      }
    }),
  );
  const cpu = process.cpuUsage(cpuStart);
  out.cpuMs = Math.round((cpu.user + cpu.system) / 1000);
  process.stdout.write(JSON.stringify(out));
}

await main();
