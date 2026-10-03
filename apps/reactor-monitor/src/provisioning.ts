import type {
  ReactorDescriptor,
  ReactorKind,
} from "@powerhousedao/reactor-monitor";

/**
 * Constructs this app's SharedWorker for a worker-hosted reactor.
 *
 * The literal `new URL("./reactor-monitor.worker.js", import.meta.url)`
 * below is the "hand the library the worker" seam from
 * `@powerhousedao/reactor-monitor`'s `reactorMonitorWorkerUrl` doc: a
 * bundler emits a worker chunk only when it can see this exact pattern at
 * a construction site, which is why it is written here rather than inside
 * the library. `./reactor-monitor.worker.js` resolves to the sibling
 * `reactor-monitor.worker.ts`, which only imports
 * `@powerhousedao/reactor-monitor/worker` — the `.js` specifier resolving to
 * a `.ts` sibling is the same Vite/TypeScript resolution the library's own
 * worker entry relies on.
 */
export function createMonitorWorker(name: string): SharedWorker {
  return new SharedWorker(
    new URL("./reactor-monitor.worker.js", import.meta.url),
    { name, type: "module" },
  );
}

/** Builds the descriptor the provision form submits. */
export function buildDescriptor(
  name: string,
  kind: ReactorKind,
): ReactorDescriptor {
  if (kind === "worker") {
    return { kind, name, createWorker: createMonitorWorker };
  }
  return { kind, name };
}
