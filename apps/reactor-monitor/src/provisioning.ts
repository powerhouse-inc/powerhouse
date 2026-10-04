import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { ProvisionRequest } from "./components/ProvisionPanel.js";

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
 * `syncMode: "local"` wires the reactor local-ONLY: a lone `LocalChannelFactory`
 * and no gql one, so it can be linked peer-to-peer from the Sync tab but has no
 * "Add remote" flow (multi-reactor W1.2).
 *
 * `"connect"` keeps the default gql channel scheme, which since W3.0 ALSO
 * composes a local factory: such a reactor serves the Sync tab's "Add remote"
 * flow AND can be linked to a sibling, which is what the mixed topologies of
 * stage 3 need. Prefer it unless the point is a reactor with no gql factory at
 * all.
 */
export function buildDescriptor(request: ProvisionRequest): ReactorDescriptor {
  const { name, kind, syncMode = "local", remoteUrl } = request;
  // A remote reactor was built by someone else: `sync` describes what this
  // monitor would BUILD, so it has no meaning here, and the handle reads the
  // far side's real channel types off its own report (multi-reactor W3.2).
  if (kind === "remote") {
    return { kind, name, remote: { url: remoteUrl ?? "" } };
  }
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
