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
 * `reactor-monitor.worker.ts`, which calls `startMonitorWorker()` from
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
 * `syncMode: "local"` builds a lone `LocalChannelFactory` (no "Add remote");
 * `"connect"` keeps the gql scheme, which also composes a local factory.
 * A remote's bearer rides `remote.headers`, a function, so it is never persisted.
 */
export function buildDescriptor(request: ProvisionRequest): ReactorDescriptor {
  const {
    name,
    kind,
    syncMode = "local",
    remoteUrl,
    bearer,
    attachmentStore = "none",
  } = request;
  if (kind === "remote") {
    return {
      kind,
      name,
      remote: {
        url: remoteUrl ?? "",
        ...(bearer
          ? { headers: () => ({ Authorization: `Bearer ${bearer}` }) }
          : {}),
      },
    };
  }
  const sync = syncMode === "local" ? { local: true } : undefined;
  if (kind === "worker") {
    // No `attachments`: byte movement is in-process only; the form says so.
    return {
      kind,
      name,
      createWorker: createMonitorWorker,
      ...(sync ? { sync } : {}),
    };
  }
  return {
    kind,
    name,
    ...(sync ? { sync } : {}),
    ...(attachmentStore === "none"
      ? {}
      : { attachments: { store: attachmentStore } }),
  };
}
