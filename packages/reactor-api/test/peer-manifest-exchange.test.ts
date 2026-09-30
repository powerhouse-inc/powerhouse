import {
  DriveCollectionId,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  JobStatus,
  REACTOR_SCHEMA,
  RECOVERABLE_GRAPHQL_ERROR_CODES,
  ReactorBuilder,
  SyncBuilder,
  SyncEventTypes,
  type IChannel,
  type IChannelFactory,
  type IQueue,
  type InProcessReactorModule,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  withSignaturePolicy,
  type DocumentModelModule,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { buildSchema, graphql } from "graphql";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  holdPollRefusals,
  pollSyncEnvelopes,
  pushSyncEnvelopes,
  recordPollMarkerRefusals,
  touchChannel,
} from "../src/graphql/reactor/resolvers.js";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

const SCHEMA = readFileSync(
  new URL("../src/graphql/reactor/schema.graphql", import.meta.url),
  "utf8",
);

/** The schema as it was before peer agreement added its fields. */
const PREVIOUS_SCHEMA = SCHEMA.split("\n")
  .filter(
    (line) =>
      !/^\s*(manifest|manifestRevision|peerManifestRevision|refusals): /.test(
        line,
      ),
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

  function connect(
    client: ISyncManager,
    fetchFn: typeof fetch,
    pollIntervalMs = 50,
  ) {
    return client.add(
      "switchboard",
      DriveCollectionId.forDrive("drive-1"),
      {
        type: "gql",
        parameters: {
          url: "http://switchboard/graphql",
          pollIntervalMs,
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

  /** A server run through graphql-js on `sdl`, announcing `claims` if set. */
  function schemaServer(
    server: ISyncManager,
    sdl: string,
    claims?: PeerManifest,
  ) {
    const schema = buildSchema(sdl);
    const requests: string[] = [];
    const fetchFn = async (_url: RequestInfo | URL, init?: RequestInit) => {
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
          touchChannel: async (args: Parameters<typeof touchChannel>[1]) => {
            const touched = await touchChannel(server, args);
            return claims ? { ...touched, manifest: claims } : touched;
          },
          pollSyncEnvelopes: (
            args: Parameters<typeof pollSyncEnvelopes>[1],
          ) => {
            const polled = pollSyncEnvelopes(server, args);
            return claims
              ? { ...polled, manifestRevision: claims.revision }
              : polled;
          },
          pushSyncEnvelopes: (args: Parameters<typeof pushSyncEnvelopes>[1]) =>
            pushSyncEnvelopes(server, args),
        },
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    return { fetchFn: fetchFn as typeof fetch, requests };
  }

  it("turns a server's refusal of a document it claimed into a hold", async () => {
    const narrow: PeerCapability = { ...WIDE_SERVER, supported: () => [1] };
    const server = await reactor([narrow]);
    const client = await reactor([WIDE_SERVER]);
    const claims = localPeerManifest(
      mergePeerCapabilities(PEER_CAPABILITIES, [WIDE_SERVER]),
      {},
    );
    const { fetchFn } = schemaServer(server, SCHEMA, claims);
    const remote = await connect(client, fetchFn);

    const clientModule = modules[modules.length - 1];
    const info = await clientModule.reactor.create(
      withSignaturePolicy(
        driveDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: "drive-1", protocolVersions: { "test-protocol": 2 } },
      ),
    );
    await vi.waitUntil(
      async () =>
        (await clientModule.reactor.getJobStatus(info.id)).status ===
        JobStatus.READ_READY,
    );

    await vi.waitFor(
      async () =>
        expect(await client.listHolds({ remoteName: "switchboard" })).toEqual([
          expect.objectContaining({
            documentId: "drive-1",
            reason: {
              protocol: "test-protocol",
              version: 2,
              peerSupports: [1, 2],
            },
          }),
        ]),
      { timeout: 10_000 },
    );
    expect(
      remote.channel.deadLetter.items.filter(
        (item) => item.documentId === "drive-1",
      ),
    ).toEqual([]);
  });

  it("silences a client whose poll names no revision, holding what it cannot run before serving", async () => {
    const server = await reactor([WIDE_SERVER]);
    const serverModule = modules[modules.length - 1];
    const wide = localPeerManifest(
      mergePeerCapabilities(PEER_CAPABILITIES, [WIDE_SERVER]),
      {},
    );
    await touchChannel(server, {
      input: {
        id: "rolled-back",
        name: "rolled-back",
        collectionId: DriveCollectionId.forDrive("drive-1").key,
        filter: FILTER,
        sinceTimestampUtcMs: "0",
        manifest: wide,
      },
    });
    const info = await serverModule.reactor.create(
      withSignaturePolicy(
        driveDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: "drive-1", protocolVersions: { "test-protocol": 2 } },
      ),
    );
    await vi.waitUntil(
      async () =>
        (await serverModule.reactor.getJobStatus(info.id)).status ===
        JobStatus.READ_READY,
    );
    const outbox = server.getById("rolled-back").channel.outbox;
    await vi.waitFor(() => expect(outbox.items.length).toBeGreaterThan(0));

    // The client rolled back to a build without peer agreement.
    const bridge = createResolverBridge(new Map([["switchboard", server]]), {
      log: false,
    });
    const response = await bridge("http://switchboard/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: "query PollSyncEnvelopes { pollSyncEnvelopes { ackOrdinal } }",
        variables: { channelId: "rolled-back", outboxAck: 0, outboxLatest: 0 },
      }),
    });
    const { data } = (await response.json()) as {
      data: { pollSyncEnvelopes: { envelopes: unknown[] } };
    };

    expect(data.pollSyncEnvelopes.envelopes).toEqual([]);
    expect(server.getById("rolled-back").meta.peer?.manifest).toBeNull();
    expect(await server.listHolds({ remoteName: "rolled-back" })).toEqual([
      expect.objectContaining({
        documentId: "drive-1",
        reason: { protocol: "test-protocol", version: 2, peerSupports: [1] },
      }),
    ]);
  });

  /** A server on SCHEMA until `rollBack`, then on the previous schema. */
  function rollbackServer(server: ISyncManager) {
    let sdl = SCHEMA;
    const pushes: Array<Record<string, unknown>> = [];
    const fetchFn = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (body.query.includes("pushSyncEnvelopes")) {
        pushes.push(body.variables);
      }
      const result = await graphql({
        schema: buildSchema(sdl),
        source: body.query,
        variableValues: body.variables,
        rootValue: {
          touchChannel: (args: Parameters<typeof touchChannel>[1]) =>
            touchChannel(server, args),
          pollSyncEnvelopes: (args: Parameters<typeof pollSyncEnvelopes>[1]) =>
            pollSyncEnvelopes(server, args),
          pushSyncEnvelopes: (args: Parameters<typeof pushSyncEnvelopes>[1]) =>
            pushSyncEnvelopes(server, args),
        },
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    return {
      fetchFn: fetchFn as typeof fetch,
      pushes,
      rollBack: () => {
        sdl = PREVIOUS_SCHEMA;
      },
    };
  }

  async function createDrive(
    module: InProcessReactorModule,
    version: number,
  ): Promise<void> {
    const info = await module.reactor.create(
      withSignaturePolicy(
        driveDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: "drive-1", protocolVersions: { "test-protocol": version } },
      ),
    );
    await vi.waitUntil(
      async () =>
        (await module.reactor.getJobStatus(info.id)).status ===
        JobStatus.READ_READY,
    );
  }

  it("names the server revision a push was gated under", async () => {
    const server = await reactor([WIDE_SERVER]);
    const client = await reactor([WIDE_SERVER]);
    const clientModule = modules[modules.length - 1];
    const { fetchFn, pushes } = rollbackServer(server);
    await connect(client, fetchFn, 60_000);

    await createDrive(clientModule, 2);

    await vi.waitFor(() => expect(pushes.length).toBeGreaterThan(0));
    expect(pushes[0].peerManifestRevision).toBe(
      server.localManifest().revision,
    );
  });

  it("holds what a rolled-back server cannot run before resending without the field", async () => {
    const server = await reactor([WIDE_SERVER]);
    const serverModule = modules[modules.length - 1];
    const client = await reactor([WIDE_SERVER]);
    const clientModule = modules[modules.length - 1];
    const { fetchFn, pushes, rollBack } = rollbackServer(server);
    const remote = await connect(client, fetchFn, 60_000);
    rollBack();

    await createDrive(clientModule, 2);

    await vi.waitFor(
      async () =>
        expect(await client.listHolds({ remoteName: "switchboard" })).toEqual([
          expect.objectContaining({ documentId: "drive-1" }),
        ]),
      { timeout: 10_000 },
    );
    expect(remote.meta.peer?.manifest).toBeNull();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toHaveProperty("peerManifestRevision");
    await expect(serverModule.reactor.get("drive-1")).rejects.toThrow();
  });

  it("resends what a rolled-back server can run without the field", async () => {
    const server = await reactor([WIDE_SERVER]);
    const serverModule = modules[modules.length - 1];
    const client = await reactor([WIDE_SERVER]);
    const clientModule = modules[modules.length - 1];
    const { fetchFn, pushes, rollBack } = rollbackServer(server);
    await connect(client, fetchFn, 60_000);
    rollBack();

    await createDrive(clientModule, 1);

    await vi.waitFor(
      async () =>
        expect((await serverModule.reactor.get("drive-1")).header.id).toBe(
          "drive-1",
        ),
      { timeout: 10_000 },
    );
    expect(pushes).toHaveLength(2);
    expect(pushes[1]).not.toHaveProperty("peerManifestRevision");
    expect(await client.listHolds({ remoteName: "switchboard" })).toEqual([]);
  });

  it("holds a document the client reports refusing from an earlier poll", async () => {
    const server = await reactor([WIDE_SERVER]);
    const serverModule = modules[modules.length - 1];
    const wide = localPeerManifest(
      mergePeerCapabilities(PEER_CAPABILITIES, [WIDE_SERVER]),
      {},
    );
    await touchChannel(server, {
      input: {
        id: "refusing",
        name: "refusing",
        collectionId: DriveCollectionId.forDrive("drive-1").key,
        filter: FILTER,
        sinceTimestampUtcMs: "0",
        manifest: wide,
      },
    });
    await createDrive(serverModule, 2);
    const bridge = createResolverBridge(new Map([["switchboard", server]]), {
      log: false,
    });

    await bridge("http://switchboard/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: "query PollSyncEnvelopes { pollSyncEnvelopes { ackOrdinal } }",
        variables: {
          channelId: "refusing",
          outboxAck: 0,
          outboxLatest: 0,
          manifestRevision: wide.revision,
          refusals: [{ documentId: "drive-1", branch: "main" }],
        },
      }),
    });

    await vi.waitFor(async () =>
      expect(await server.listHolds({ remoteName: "refusing" })).toEqual([
        expect.objectContaining({
          documentId: "drive-1",
          reason: {
            protocol: "test-protocol",
            version: 2,
            peerSupports: [1, 2],
          },
        }),
      ]),
    );
    expect(server.getById("refusing").channel.deadLetter.items).toEqual([]);
  });

  it("ignores a polled refusal of a kind it does not know", async () => {
    const server = await reactor();
    await touchChannel(server, {
      input: {
        id: "refusing",
        name: "refusing",
        collectionId: DriveCollectionId.forDrive("drive-1").key,
        filter: FILTER,
        sinceTimestampUtcMs: "0",
        manifest: server.localManifest(),
      },
    });
    const added = vi.spyOn(
      server.getById("refusing").channel.deadLetter,
      "add",
    );

    holdPollRefusals(server, "refusing", [
      { documentId: "drive-1", branch: "main", kind: "future" },
    ]);

    expect(added).not.toHaveBeenCalled();
    expect(await server.listHolds({ remoteName: "refusing" })).toEqual([]);
  });

  it("fails a poll whose marker refusals were not recorded with a recoverable code", async () => {
    const server = await reactor();
    await touchChannel(server, {
      input: {
        id: "refusing",
        name: "refusing",
        collectionId: DriveCollectionId.forDrive("drive-1").key,
        filter: FILTER,
        sinceTimestampUtcMs: "0",
        manifest: server.localManifest(),
      },
    });
    vi.spyOn(
      server as unknown as {
        recordPolledMarkerRefusals: (...args: unknown[]) => Promise<void>;
      },
      "recordPolledMarkerRefusals",
    ).mockRejectedValue(new Error("Connection terminated unexpectedly"));

    const failure = recordPollMarkerRefusals(server, "refusing", [
      { documentId: "purged-1", branch: "main", kind: "marker" },
    ]);

    await expect(failure).rejects.toMatchObject({
      extensions: { code: RECOVERABLE_GRAPHQL_ERROR_CODES.refusalNotRecorded },
    });
    await expect(failure).rejects.not.toThrow(/Connection terminated/);
  });

  it("hands a reported marker refusal to the sync manager, and holds nothing", async () => {
    const server = await reactor();
    const serverModule = modules[modules.length - 1];
    const manifest = server.localManifest();
    await touchChannel(server, {
      input: {
        id: "refusing",
        name: "refusing",
        collectionId: DriveCollectionId.forDrive("drive-1").key,
        filter: FILTER,
        sinceTimestampUtcMs: "0",
        manifest,
      },
    });
    const refused: unknown[] = [];
    serverModule.eventBus.subscribe(SyncEventTypes.PURGE_REFUSED, (_t, e) => {
      refused.push(e);
    });
    const recorded = vi.spyOn(
      server as unknown as {
        recordPolledMarkerRefusals: (...args: unknown[]) => Promise<void>;
      },
      "recordPolledMarkerRefusals",
    );
    const bridge = createResolverBridge(new Map([["switchboard", server]]), {
      log: false,
    });

    await bridge("http://switchboard/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: "query PollSyncEnvelopes { pollSyncEnvelopes { ackOrdinal } }",
        variables: {
          channelId: "refusing",
          outboxAck: 0,
          outboxLatest: 0,
          manifestRevision: manifest.revision,
          refusals: [
            { documentId: "purged-1", branch: "main", kind: "marker" },
          ],
        },
      }),
    });

    expect(recorded).toHaveBeenCalledWith("refusing", [
      { documentId: "purged-1", branch: "main" },
    ]);
    // No document purged-1 was tombstoned here, so the marker was never owed.
    expect(refused).toEqual([]);
    const rows = await serverModule.database
      .withSchema(REACTOR_SCHEMA)
      .selectFrom("sync_purge_refusals" as never)
      .select(["remote_name" as never, "document_id" as never])
      .execute();
    expect(rows).toEqual([]);
    expect(await server.listHolds({ remoteName: "refusing" })).toEqual([]);
    expect(server.getById("refusing").channel.deadLetter.items).toEqual([]);
  });
});
