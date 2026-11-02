import type {
  GaugeGrowth,
  MemoryDerived,
  MemorySample,
  MemoryVerdict,
} from "./types.js";

const MB = 1024 * 1024;
const MIN_OPS_FOR_RATE = 1000;
const STEADY_MB_PER_MIN = 5;
/** A window with fewer new writes than this reads as idle. */
const IDLE_OPS = 10;

type Point = { x: number; y: number };

/** The least-squares slope of y per unit of x; 0 with too few points. */
export function slope(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let top = 0;
  let bottom = 0;
  for (const { x, y } of points) {
    top += (x - meanX) * (y - meanY);
    bottom += (x - meanX) ** 2;
  }
  return bottom === 0 ? 0 : top / bottom;
}

/** Pearson's r; null when either series is flat. */
export function correlation(
  a: readonly number[],
  b: readonly number[],
): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const meanA = a.slice(0, n).reduce((sum, v) => sum + v, 0) / n;
  const meanB = b.slice(0, n).reduce((sum, v) => sum + v, 0) / n;
  let top = 0;
  let squaresA = 0;
  let squaresB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    top += da * db;
    squaresA += da * da;
    squaresB += db * db;
  }
  return squaresA === 0 || squaresB === 0
    ? null
    : top / Math.sqrt(squaresA * squaresB);
}

type WindowSample = Pick<
  MemorySample,
  "t" | "rss" | "heapUsed" | "postGcHeap" | "external" | "workers" | "counters"
>;

function minutesOf(sample: WindowSample): number {
  return Date.parse(sample.t) / 60_000;
}

function mbPerMin(
  samples: readonly WindowSample[],
  read: (sample: WindowSample) => number | null,
): number | null {
  const points: Point[] = [];
  for (const sample of samples) {
    const y = read(sample);
    if (y !== null) points.push({ x: minutesOf(sample), y: y / MB });
  }
  return points.length < 2 ? null : slope(points);
}

function pgliteBytes(sample: WindowSample): number {
  let total = 0;
  for (const worker of Object.values(sample.workers)) total += worker.wasm ?? 0;
  return total;
}

function verdictOf(
  postGcMbPerMin: number | null,
  opsWritten: number,
): MemoryVerdict {
  if (postGcMbPerMin === null || postGcMbPerMin < STEADY_MB_PER_MIN) {
    return "steady";
  }
  return opsWritten < IDLE_OPS ? "growing-without-ops" : "growing";
}

/** The samples at most `windowMin` older than the newest. */
export function withinWindow<T extends { t: string }>(
  samples: readonly T[],
  windowMin: number,
): T[] {
  const newest = samples.at(-1);
  if (!newest) return [];
  const since = Date.parse(newest.t) - windowMin * 60_000;
  return samples.filter((sample) => Date.parse(sample.t) >= since);
}

/** Rates over `samples`, oldest first; the post-GC slope is the leak indicator. */
export function deriveRates(
  samples: readonly WindowSample[],
  windowMin: number,
): MemoryDerived {
  const first = samples[0];
  const last = samples.at(-1);
  const ops =
    first && last ? last.counters.opsWritten - first.counters.opsWritten : 0;
  const firstPostGc = first?.postGcHeap;
  const lastPostGc = last?.postGcHeap;
  const enoughOps = ops >= MIN_OPS_FOR_RATE;
  const postGcMbPerMin = mbPerMin(samples, (s) => s.postGcHeap);
  return {
    windowMin,
    mbPer1kOps:
      first && last && enoughOps
        ? (last.rss - first.rss) / MB / (ops / 1000)
        : null,
    postGcMbPer1kOps:
      enoughOps &&
      firstPostGc !== undefined &&
      firstPostGc !== null &&
      lastPostGc !== undefined &&
      lastPostGc !== null
        ? (lastPostGc - firstPostGc) / MB / (ops / 1000)
        : null,
    rssMbPerMin: mbPerMin(samples, (s) => s.rss) ?? 0,
    heapMbPerMin: mbPerMin(samples, (s) => s.heapUsed) ?? 0,
    postGcMbPerMin,
    externalMbPerMin: mbPerMin(samples, (s) => s.external) ?? 0,
    pgliteMbPerMin: mbPerMin(samples, pgliteBytes) ?? 0,
    verdict: verdictOf(postGcMbPerMin, ops),
  };
}

/** Every numeric gauge's slope over `samples`, fastest growth first. */
export function gaugeGrowth(
  samples: readonly Pick<MemorySample, "t" | "gauges" | "postGcHeap">[],
): GaugeGrowth[] {
  const last = samples.at(-1);
  if (!last || samples.length < 2) return [];
  const postGc = samples.map((sample) => sample.postGcHeap ?? 0);
  const growth: GaugeGrowth[] = [];
  for (const [name, values] of Object.entries(last.gauges)) {
    for (const [field, value] of Object.entries(values)) {
      const series = samples.map((s) => s.gauges[name]?.[field] ?? 0);
      growth.push({
        gauge: `${name}.${field}`,
        value,
        perMin: slope(
          series.map((y, i) => ({
            x: Date.parse(samples[i]!.t) / 60_000,
            y,
          })),
        ),
        r: correlation(series, postGc),
      });
    }
  }
  return growth.sort((a, b) => b.perMin - a.perMin);
}
