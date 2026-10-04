import type {
  ReactorDescriptor,
  ReactorKind,
} from "@powerhousedao/reactor-monitor";
import type { ProvisionSyncMode } from "./components/ProvisionPanel.js";

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

/**
 * Builds the descriptor the provision form submits.
 *
 * `syncMode: "local"` wires the reactor for monitor-brokered `LocalChannel`
 * sync (multi-reactor W1.2), so two such reactors can be linked peer-to-peer
 * from the Sync tab with no Switchboard. `"connect"` keeps the default gql
 * channel scheme for the Sync tab's manual "Add remote" flow. A reactor is one
 * or the other: the builder wires a single channel factory.
 */
export function buildDescriptor(
  name: string,
  kind: ReactorKind,
  syncMode: ProvisionSyncMode = "local",
): ReactorDescriptor {
  const sync = syncMode === "local" ? { local: true } : undefined;
  if (kind === "worker") {
    return {
      kind,
      name,
      createWorker: createMonitorWorker,
      ...(sync ? { sync } : {}),
    };
  }
  return { kind, name, ...(sync ? { sync } : {}) };
}
