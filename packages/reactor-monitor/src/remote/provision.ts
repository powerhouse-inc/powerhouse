import type { ManagedRemoteReactor, ReactorDescriptor } from "../types.js";
import { RemoteInspectorClient } from "./client.js";
import { RemoteSyncManagerClient } from "./sync-manager.js";
import { unwiredRemoteClient, unwiredRemoteEventBus } from "./unwired.js";

/** reactor-api mounts each subgraph at `<graphql>/<name>`. */
export function inspectionEndpoint(url: string, override?: string): string {
  if (override) {
    return override;
  }
  return `${url.replace(/\/+$/, "")}/inspection`;
}

/** Attaches to a running reactor over its read-only inspection subgraph. */
export async function provisionRemote(
  descriptor: ReactorDescriptor,
): Promise<ManagedRemoteReactor> {
  const remote = descriptor.remote;
  if (!remote) {
    throw new Error(
      `Reactor ${JSON.stringify(descriptor.name)} is kind "remote" but carries no "remote" config: give it the reactor's GraphQL url`,
    );
  }

  const endpoint = inspectionEndpoint(remote.url, remote.inspectionUrl);
  const client = new RemoteInspectorClient({
    url: endpoint,
    ...(remote.headers ? { headers: remote.headers } : {}),
    ...(remote.fetch ? { fetch: remote.fetch } : {}),
    ...(remote.timeoutMs !== undefined ? { timeoutMs: remote.timeoutMs } : {}),
  });

  const info = await client.info();
  const syncManager = new RemoteSyncManagerClient(client);
  // Remotes are an operator read; a failure to seed belongs to the Sync tab.
  if (info.access) {
    try {
      await syncManager.startup();
    } catch (error) {
      console.error(
        `[reactor-monitor] remote reactor ${JSON.stringify(descriptor.name)}: could not read its remotes at provision time:`,
        error,
      );
    }
  }

  let shutdown = false;

  return {
    name: descriptor.name,
    kind: "remote",
    reach: { hosting: "remote", inspection: "rpc" },
    endpoint,
    url: remote.url,
    ...(remote.headers ? { headers: remote.headers } : {}),
    ...(remote.fetch ? { fetch: remote.fetch } : {}),
    get info() {
      return client.reportedInfo ?? info;
    },
    refreshInfo: () => client.info(),
    inspector: client,
    syncManager,
    client: unwiredRemoteClient(endpoint),
    events: unwiredRemoteEventBus(endpoint),
    kill: () => {
      shutdown = true;
      return Promise.resolve();
    },
    isShutdown: () => shutdown,
  };
}
