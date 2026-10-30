import type {
  GaugeReader,
  GaugeValues,
  WorkerMemoryReader,
  WorkerMemorySample,
} from "./types.js";

type Registry = {
  gauges: Map<string, GaugeReader>;
  workers: Map<string, WorkerMemoryReader>;
};

const REGISTRY = Symbol.for("powerhouse.telemetry.gauges");

/**
 * Held on `globalThis`, so a package with its own copy of this module (the
 * Vite package loader gives each one) registers into the same place.
 */
function registry(): Registry {
  const holder = globalThis as { [REGISTRY]?: Registry };
  return (holder[REGISTRY] ??= { gauges: new Map(), workers: new Map() });
}

/**
 * Adds a gauge telemetry reads at each tick, with the number of entries a
 * structure holds rather than bytes: it must not allocate. Returns the
 * unregister; a processor calls it in `onDisconnect`, or the closure keeps a
 * reloaded module alive.
 */
export function registerTelemetryGauge(
  name: string,
  read: GaugeReader,
): () => void {
  const { gauges } = registry();
  gauges.set(name, read);
  return () => {
    if (gauges.get(name) === read) gauges.delete(name);
  };
}

/** Adds a worker isolate to the samples. Returns the unregister. */
export function registerTelemetryWorker(
  name: string,
  read: WorkerMemoryReader,
): () => void {
  const { workers } = registry();
  workers.set(name, read);
  return () => {
    if (workers.get(name) === read) workers.delete(name);
  };
}

/** A gauge that throws reads as `{ error: 1 }`, so one bad gauge costs one row. */
export function readGauges(
  own: ReadonlyMap<string, GaugeReader> = new Map(),
): Record<string, GaugeValues> {
  const values: Record<string, GaugeValues> = {};
  for (const source of [own, registry().gauges]) {
    for (const [name, read] of source) {
      try {
        values[name] = read();
      } catch {
        values[name] = { error: 1 };
      }
    }
  }
  return values;
}

/** Every worker, each waiting at most `timeoutMs`; undefined for one that fails. */
export async function readWorkers(
  timeoutMs: number,
): Promise<Record<string, WorkerMemorySample | undefined>> {
  const entries = [...registry().workers];
  const results = await Promise.allSettled(
    entries.map(([, read]) => withTimeout(read(), timeoutMs)),
  );
  const samples: Record<string, WorkerMemorySample | undefined> = {};
  results.forEach((result, i) => {
    samples[entries[i]![0]] =
      result.status === "fulfilled" ? result.value : undefined;
  });
  return samples;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
