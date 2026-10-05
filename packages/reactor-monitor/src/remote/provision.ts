import { remoteReactorCapabilities } from "../capabilities.js";
import type { ManagedRemoteReactor, ReactorDescriptor } from "../types.js";
import { RemoteInspectorClient } from "./client.js";
import { RemoteSyncManagerClient } from "./sync-manager.js";
import { unwiredRemoteClient, unwiredRemoteEventBus } from "./unwired.js";

/**
 * Where the inspection subgraph sits, given a reactor's GraphQL endpoint.
 *
 * reactor-api mounts every subgraph at `<basePath>/graphql/<name>`, so the
 * inspection one is the GraphQL endpoint plus `/inspection`. Derived rather
 * than configured, because a monitor user has the Switchboard URL to hand (it
 * is the same one the add-remote form takes) and should not have to know the
 * mount convention; `remote.inspectionUrl` overrides it for a host behind a
 * path-rewriting proxy, or to address the stitched supergraph instead.
 */
export function inspectionEndpoint(url: string, override?: string): string {
  if (override) {
    return override;
  }
  return `${url.replace(/\/+$/, "")}/inspection`;
}

/**
 * Attaches to an already-running reactor over HTTP (multi-reactor W3.2).
 *
 * Nothing is built here: the handle's `inspector`, `syncManager` and `dbQuery`
 * are the same typed surfaces a local reactor exposes, implemented against
 * reactor-api's inspection subgraph, so every monitor view works against a
 * Switchboard unchanged.
 *
 * The one request this makes up front is the reactor's own `info`, and it is
 * load-bearing twice over. It is the handle's PROOF OF LIFE -- a URL that is
 * not a reactor, or one whose host serves no inspection subgraph, fails here
 * with the endpoint in the message rather than on a later tab render. And it
 * is the capability row's SOURCE: which channel types that reactor routes and
 * whether it runs workflows are facts only it holds, and the row is frozen
 * from its answer exactly as a worker's row is frozen from its built config.
 *
 * The record itself is NOT frozen onto the handle. `serverInfo` reads through
 * to the client's current answer and `refreshServerInfo()` re-asks, because the
 * admin tiers in it are a deployment's posture rather than a property of the
 * reactor: an operator restarts the host with `PH_INSPECTION_ADMIN=true` and
 * the levers are meant to go live under the same handle.
 */
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
  });

  const serverInfo = await client.info();
  const syncManager = new RemoteSyncManagerClient(client);
  // Seed the remote list once, so the Sync tab's first render shows the
  // reactor's remotes rather than an empty list it corrects on the next poll.
  // A reactor whose sync view cannot be read is still attachable: the failure
  // belongs to that tab, not to provisioning.
  try {
    await syncManager.startup();
  } catch (error) {
    console.error(
      `[reactor-monitor] remote reactor ${JSON.stringify(descriptor.name)}: could not read its remotes at provision time:`,
      error,
    );
  }

  let shutdown = false;

  return {
    name: descriptor.name,
    kind: "remote",
    capabilities: remoteReactorCapabilities(descriptor, {
      workflows: serverInfo.workflows,
      syncChannelTypes: serverInfo.syncChannels,
    }),
    endpoint,
    url: remote.url,
    ...(remote.headers ? { headers: remote.headers } : {}),
    ...(remote.fetch ? { fetch: remote.fetch } : {}),
    // Read through to the client's own last answer rather than a copy taken
    // here: the client re-reads the reported facts on its refusal paths too, so
    // a copy would leave a holder looking at a tier flag the client has already
    // learned is wrong. The fallback is unreachable in practice -- the read
    // above seeded the client's cache, which is only ever replaced -- and is
    // the provision-time record either way.
    get serverInfo() {
      return client.reportedInfo ?? serverInfo;
    },
    refreshServerInfo: () => client.refreshInfo(),
    remoteInspector: client,
    inspector: client,
    dbQuery: client,
    syncManager,
    client: unwiredRemoteClient(endpoint),
    events: unwiredRemoteEventBus(endpoint),
    // Nothing of the remote reactor's is this process's to stop; killing the
    // handle only stops this monitor asking it questions.
    kill: () => {
      shutdown = true;
      return Promise.resolve();
    },
    isShutdown: () => shutdown,
  };
}
