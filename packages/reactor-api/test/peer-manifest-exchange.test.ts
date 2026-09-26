import {
  DriveCollectionId,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  ReactorBuilder,
  SyncBuilder,
  type IChannel,
  type IChannelFactory,
  type IQueue,
  type InProcessReactorModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PeerCapability,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { buildSchema, graphql } from "graphql";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pollSyncEnvelopes,
  touchChannel,
} from "../src/graphql/reactor/resolvers.js";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

const SCHEMA = readFileSync(
  new URL("../src/graphql/reactor/schema.graphql", import.meta.url),
  "utf8",
);

/** The schema as it was before peer agreement added its four fields. */
const PREVIOUS_SCHEMA = SCHEMA.split("\n")
  .filter(
    (line) =>
      !/^\s*(manifest|manifestRevision|peerManifestRevision): /.test(line),
  )
  .join("\n");

const WIDE_SERVER: PeerCapability = {
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => [1, 2],
  optional: true,
};

const FILTER = { documentId: [], scope: [], branch: "main" };

// The poll timer only asks the queue how busy it is.
const idleQueue = { totalSize: () => Promise.resolve(0) } as unknown as IQueue;

describe("peer manifest exchange over the sync resolvers", () => {
  const modules: InProcessReactorModule[] = [];

  afterEach(() => {
    for (const module of modules.splice(0)) {
      module.reactor.kill();
    }
  });

  async function reactor(extra: PeerCapability[] = []) {
    const logger = new ConsoleLogger(["test"]);
    const factory: IChannelFactory = {
      instance(...args): IChannel {
        const [remoteId, remoteName, config, cursorStorage] = args;
        if (config.type === "polling") {
          return new GqlResponseChannelFactory(logger).instance(
            remoteId,
            remoteName,
            config,
            cursorStorage,
          );
        }
        return new GqlRequestChannelFactory(
          logger,
          undefined,
          idleQueue,
        ).instance(...args);
      },
    };
    const module = await new ReactorBuilder()
      .withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withPeerCapabilities(extra)
      .withSync(new SyncBuilder().withChannelFactory(factory))
      .buildModule();
    modules.push(module);
    return module.syncModule!.syncManager;
  }

  function connect(client: ISyncManager, fetchFn: typeof fetch) {
    return client.add(
      "switchboard",
      DriveCollectionId.forDrive("drive-1"),
      {
        type: "gql",
        parameters: {
          url: "http://switchboard/graphql",
          pollIntervalMs: 50,
          fetchFn,
        },
      },
      FILTER,
    );
  }

  it("exchanges manifests between a new client and a new server", async () => {
    const server = await reactor([WIDE_SERVER]);
    const client = await reactor();
    const bridge = createResolverBridge(new Map([["switchboard", server]]), {
      log: false,
    });

    const remote = await connect(client, bridge);

    expect(remote.meta.peer?.manifest).toEqual(server.localManifest());
    const served = server.getById(remote.meta.id);
    expect(served.meta.peer?.manifest).toEqual(client.localManifest());
  });

  it("records an old client as silent, and a re-touch without a manifest clears one", async () => {
    const server = await reactor();
    const client = await reactor();
    const input = {
      id: "old-client",
      name: "old-client",
      collectionId: DriveCollectionId.forDrive("drive-1").key,
      filter: FILTER,
      sinceTimestampUtcMs: "0",
    };

    await touchChannel(server, { input });
    expect(server.getById("old-client").meta.peer).toMatchObject({
      manifest: null,
    });

    await touchChannel(server, {
      input: { ...input, manifest: client.localManifest() },
    });
    expect(server.getById("old-client").meta.peer?.manifest).toEqual(
      client.localManifest(),
    );

    await touchChannel(server, { input });
    expect(server.getById("old-client").meta.peer?.manifest).toBeNull();

    const poll = pollSyncEnvelopes(server, {
      channelId: "old-client",
      outboxAck: 0,
      outboxLatest: 0,
    });
    expect(poll.manifestRevision).toBe(server.localManifest().revision);
    expect(poll.peerManifestRevision).toBeNull();
  });

  it("treats a server on the previous schema as silent and keeps syncing", async () => {
    const server = await reactor();
    const client = await reactor();
    const schema = buildSchema(PREVIOUS_SCHEMA);
    const requests: string[] = [];

    const previousServer = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(init!.body as string) as {
          query: string;
          variables: Record<string, unknown>;
        };
        requests.push(body.query);
        const result = await graphql({
          schema,
          source: body.query,
          variableValues: body.variables,
          rootValue: {
            touchChannel: (args: Parameters<typeof touchChannel>[1]) =>
              touchChannel(server, args),
            pollSyncEnvelopes: (
              args: Parameters<typeof pollSyncEnvelopes>[1],
            ) => pollSyncEnvelopes(server, args),
          },
        });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    const remote = await connect(client, previousServer as typeof fetch);

    expect(remote.meta.peer).toMatchObject({ manifest: null });
    const touches = requests.filter((q) => q.includes("touchChannel"));
    expect(touches).toHaveLength(2);
    expect(touches[0]).toContain("manifest");
    expect(touches[1]).not.toContain("manifest");
    await vi.waitFor(() =>
      expect(requests.some((q) => q.includes("pollSyncEnvelopes"))).toBe(true),
    );
    expect(remote.channel.getConnectionState().state).toBe("connected");
    expect(
      requests
        .filter((q) => q.includes("pollSyncEnvelopes"))
        .every((q) => !q.includes("manifestRevision")),
    ).toBe(true);
  });
});
