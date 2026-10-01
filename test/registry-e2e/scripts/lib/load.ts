// A fixed-concurrency HTTP load loop: each worker fetches the next URL, reads
// the whole body, and records latency and status until the deadline.
export interface LoadResult {
  requests: number;
  errors: number;
  /** Responses that weren't 2xx or 304 */
  failures: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  statuses: Record<string, number>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return Math.round(sorted[Math.max(0, index)] * 10) / 10;
}

export async function load(options: {
  url: () => string;
  concurrency: number;
  durationMs: number;
  timeoutMs?: number;
}): Promise<LoadResult> {
  const latencies: number[] = [];
  const statuses: Record<string, number> = {};
  let errors = 0;
  let failures = 0;
  const started = performance.now();
  const deadline = started + options.durationMs;

  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      while (performance.now() < deadline) {
        const t0 = performance.now();
        try {
          const res = await fetch(options.url(), {
            signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
          });
          await res.arrayBuffer();
          const key = String(res.status);
          statuses[key] = (statuses[key] ?? 0) + 1;
          if (!(res.ok || res.status === 304)) failures++;
        } catch {
          errors++;
          statuses.error = (statuses.error ?? 0) + 1;
        }
        latencies.push(performance.now() - t0);
      }
    }),
  );

  const elapsed = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    requests: latencies.length,
    errors,
    failures,
    rps: Math.round((latencies.length / elapsed) * 10) / 10,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: percentile(latencies, 100),
    statuses,
  };
}
