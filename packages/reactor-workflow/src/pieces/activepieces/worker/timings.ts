// Wall-clock marks a child takes while serving one request, sent back with its
// response so the host can draw them as spans. The child carries no tracer.
import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkerPhaseTiming, WorkerTimings } from "./protocol.js";

// Epoch ms with sub-ms precision, comparable across processes on one machine.
export function epochNow(): number {
  return performance.timeOrigin + performance.now();
}

let readyAt: number | undefined;
let bootReported = false;

// When the entry finished loading; reported once, with the first response.
export function markWorkerReady(): void {
  readyAt ??= epochNow();
}

export interface RequestTimings {
  received: number;
  phases: WorkerPhaseTiming[];
}

const current = new AsyncLocalStorage<RequestTimings>();
// The phase `fn` runs inside, so a nested one (models in action) names its parent.
const currentPhase = new AsyncLocalStorage<string>();

export function startRequestTimings(): RequestTimings {
  return { received: epochNow(), phases: [] };
}

export function withRequestTimings<T>(
  timings: RequestTimings,
  fn: () => Promise<T>,
): Promise<T> {
  return current.run(timings, fn);
}

// Records `fn` as a phase of the request being served, if any.
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | boolean>,
): Promise<T> {
  const timings = current.getStore();
  if (!timings) return fn();
  const parent = currentPhase.getStore();
  const start = epochNow();
  try {
    return await currentPhase.run(name, fn);
  } finally {
    timings.phases.push({
      name,
      start,
      end: epochNow(),
      ...(parent ? { parent } : {}),
      ...(attributes ? { attributes } : {}),
    });
  }
}

export function finishRequestTimings(timings: RequestTimings): WorkerTimings {
  const boot = !bootReported && readyAt !== undefined;
  bootReported = true;
  return {
    received: timings.received,
    sent: epochNow(),
    phases: timings.phases,
    ...(boot ? { ready: readyAt } : {}),
  };
}
