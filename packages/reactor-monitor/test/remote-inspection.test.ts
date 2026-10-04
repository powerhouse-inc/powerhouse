import {
  deriveConnectionHealth,
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  type ConnectionStateSnapshot,
} from "@powerhousedao/reactor";
import { beforeEach, describe, expect, it } from "vitest";
import {
  inspectionEndpoint,
  provision,
  provisionRemote,
  RemoteInspectorClient,
  RemoteSyncManagerClient,
  type ManagedRemoteReactor,
  type ReactorDescriptor,
} from "../src/index.js";

/**
 * The remote inspection client (multi-reactor W3.2) against a stand-in for
 * reactor-api's inspection subgraph.
 *
 * The stand-in is hand-built, and that split is deliberate: the SERVER half --
 * that the real SDL and resolvers answer these fields, with these shapes, and
 * refuse the admin tiers -- is proven against a real reactor module in
 * `packages/reactor-api/test/inspection-subgraph.test.ts`, which also pins the
 * root field names so a rename is a visible diff next to
 * `src/remote/operations.ts`. What this suite proves is the half that lives
 * here: that the documents carry the right variables, that the responses decode
 * back into the reactor's own types (a `Date` rebuilt from epoch ms, an absent
 * optional dropped rather than carried as `null`), that the capability row is
 * read from what the reactor REPORTED, and that a lever the far side does not
 * serve is refused by name before a request is made.
 */

type RecordedRequest = {
  operation: string;
  variables: Record<string, unknown>;
};

const SNAPSHOT: ConnectionStateSnapshot = {
  state: "connected",
  failureCount: 0,
  lastSuccessUtcMs: 0,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

const REMOTE_META = {
  id: "remote-1",
  name: "switchboard",
  collectionId: { driveId: "drive-a", branch: "main" },
  channelConfig: {
    type: POLLING_CHANNEL_TYPE,
    parameters: { url: "http://peer.example/graphql" },
  },
  filter: { documentId: [], scope: ["global"], branch: "main" },
  options: {},
};

const LAST_ERROR_MS = 1_760_000_000_000;

type FakeServerOptions = {
  adminEnabled?: boolean;
  sqlEnabled?: boolean;
  workflows?: boolean;
  syncChannels?: readonly string[];
  /**
   * Answer every mutation with reactor-api's own refusal, extensions code and
   * all -- the shape of a host that was restarted WITHOUT the admin flag under
   * a client that still believes it has one.
   */
  refuseMutations?: boolean;
  /** Overrides for the one wire remote the server reports. */
  remote?: Record<string, unknown>;
};

/**
 * A fetch that answers the inspection documents, recording what it was asked.
 *
 * Routes on the GraphQL operation NAME in the document, which is how a real
 * server distinguishes them too, so a document that forgot its name or sent
 * the wrong variables fails here rather than silently matching.
 */
function fakeInspectionServer(options: FakeServerOptions = {}) {
  const requests: RecordedRequest[] = [];
  const info = {
    hosting: "remote",
    inspection: "rpc",
    storageKind: "postgres",
    processors: true,
    workflows: options.workflows ?? false,
    syncChannels: options.syncChannels ?? [POLLING_CHANNEL_TYPE],
    adminEnabled: options.adminEnabled ?? false,
    sqlEnabled: options.sqlEnabled ?? false,
  };

  const health = deriveConnectionHealth(SNAPSHOT, 0);
  const wireRemote: Record<string, unknown> = {
    remoteName: REMOTE_META.name,
    remoteId: REMOTE_META.id,
    meta: REMOTE_META,
    inboxCursor: {
      cursorType: "inbox",
      cursorOrdinal: 7,
      lastSyncedAtUtcMs: 1_700_000_000_000,
      liveAckOrdinal: 5,
      liveLatestOrdinal: 9,
    },
    outboxCursor: {
      cursorType: "outbox",
      cursorOrdinal: 3,
      lastSyncedAtUtcMs: null,
      liveAckOrdinal: 3,
      liveLatestOrdinal: 3,
    },
    mailboxDepths: { inbox: 2, outbox: 1, deadLetter: 1 },
    connection: {
      snapshot: health.snapshot,
      neverSucceeded: health.neverSucceeded,
      stalenessMs: health.stalenessMs ?? null,
    },
    ...options.remote,
  };

  const answers: Record<string, unknown> = {
    ReactorInspectionInfo: { inspection: { info } },
    ReactorInspectionQueueState: {
      inspection: {
        queueState: {
          isPaused: true,
          totalPending: 1,
          totalExecuting: 0,
          pendingJobs: [{ id: "job-1", documentId: "doc-1" }],
          executingJobs: [],
        },
      },
    },
    ReactorInspectionProcessors: {
      inspection: {
        processors: [
          {
            processorId: "p-1",
            factoryId: "f-1",
            driveId: "drive-a",
            processorIndex: 0,
            lastOrdinal: 12,
            status: "errored",
            lastError: "boom",
            lastErrorTimestampUtcMs: LAST_ERROR_MS,
          },
          {
            processorId: "p-2",
            factoryId: "f-1",
            driveId: "drive-a",
            processorIndex: 1,
            lastOrdinal: 4,
            status: "active",
            lastError: null,
            lastErrorTimestampUtcMs: null,
          },
        ],
      },
    },
    ReactorInspectionCatchUp: {
      inspection: { catchUpStatus: { consumers: [], watermark: null } },
    },
    ReactorInspectionStorageHealth: {
      inspection: {
        storageHealth: {
          healthy: true,
          everRecreated: false,
          recreateCount: 0,
          lastRecreated: null,
        },
      },
    },
    ReactorInspectionRemotes: { inspection: { remotes: [wireRemote] } },
    ReactorInspectionRemote: { inspection: { remote: wireRemote } },
    ReactorInspectionDeadLetters: {
      inspection: {
        deadLetters: {
          remoteName: REMOTE_META.name,
          results: [{ id: "dl-1", documentId: "doc-1" }],
          nextCursor: null,
        },
      },
    },
    ReactorInspectionHolds: {
      inspection: { holds: [{ remoteName: REMOTE_META.name }] },
    },
    ReactorInspectionPauseQueue: { inspectionPauseQueue: true },
    ReactorInspectionResumeQueue: { inspectionResumeQueue: true },
    ReactorInspectionRetryProcessor: { inspectionRetryProcessor: true },
    ReactorInspectionSweepCatchUp: { inspectionSweepCatchUp: [] },
    ReactorInspectionTriggerPull: { inspectionTriggerPull: true },
    ReactorInspectionRewindInboxCursor: { inspectionRewindInboxCursor: true },
    ReactorInspectionResetChannel: { inspectionResetChannel: true },
    ReactorInspectionRequeueDeadLetter: { inspectionRequeueDeadLetter: true },
    ReactorInspectionClearDeadLetter: { inspectionClearDeadLetter: true },
    ReactorInspectionQueryDb: { inspectionQueryDb: [{ one: 1 }] },
  };

  const fetchImpl: typeof fetch = (_input, init) => {
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {
      query: string;
      variables: Record<string, unknown>;
    };
    const name = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1];
    if (!name) {
      throw new Error(`unnamed operation: ${body.query}`);
    }
    requests.push({ operation: name, variables: body.variables });
    if (options.refuseMutations && body.query.startsWith("mutation")) {
      return Promise.resolve(
        Response.json({
          errors: [
            {
              message:
                "Reactor inspection pausing the queue is not enabled on this host: set PH_INSPECTION_ADMIN=true (or 1, yes, on) to serve it",
              extensions: { code: "FORBIDDEN" },
            },
          ],
        }),
      );
    }
    const data = answers[name];
    if (data === undefined) {
      return Promise.resolve(
        Response.json({ errors: [{ message: `no stub for ${name}` }] }),
      );
    }
    return Promise.resolve(Response.json({ data }));
  };

  return { fetchImpl, requests, info, wireRemote };
}

function remoteDescriptor(
  fetchImpl: typeof fetch,
  overrides: Partial<ReactorDescriptor["remote"]> = {},
): ReactorDescriptor {
  return {
    kind: "remote",
    name: "switchboard",
    remote: {
      url: "http://host.example/graphql",
      fetch: fetchImpl,
      ...overrides,
    },
  };
}

describe("inspectionEndpoint", () => {
  it("derives the subgraph mount from the reactor's GraphQL url", () => {
    expect(inspectionEndpoint("http://host/graphql")).toBe(
      "http://host/graphql/inspection",
    );
    // A trailing slash must not produce a double one: that is a 404 on a
    // path-matched mount.
    expect(inspectionEndpoint("http://host/graphql/")).toBe(
      "http://host/graphql/inspection",
    );
  });

  it("takes an explicit override for a host behind a rewriting proxy", () => {
    expect(
      inspectionEndpoint("http://host/graphql", "http://host/inspect"),
    ).toBe("http://host/inspect");
  });
});

describe("RemoteInspectorClient reads", () => {
  let server: ReturnType<typeof fakeInspectionServer>;
  let client: RemoteInspectorClient;

  beforeEach(() => {
    server = fakeInspectionServer();
    client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });
  });

  it("decodes queue state into the reactor's own snapshot shape", async () => {
    await expect(client.getQueueState()).resolves.toEqual({
      isPaused: true,
      totalPending: 1,
      totalExecuting: 0,
      pendingJobs: [{ id: "job-1", documentId: "doc-1" }],
      executingJobs: [],
    });
  });

  it("rebuilds a processor's error Date from epoch milliseconds", async () => {
    const processors = await client.getProcessors();

    expect(processors).toHaveLength(2);
    expect(processors[0]!.lastErrorTimestamp).toBeInstanceOf(Date);
    expect(processors[0]!.lastErrorTimestamp?.getTime()).toBe(LAST_ERROR_MS);
    expect(processors[0]!.lastError).toBe("boom");
    // A JSON `null` must come back as the absent optional the type declares,
    // not as `null` in a field typed `string | undefined`.
    expect(processors[1]!.lastError).toBeUndefined();
    expect(processors[1]!.lastErrorTimestamp).toBeUndefined();
  });

  it("drops an absent optional rather than carrying its null", async () => {
    await expect(client.getStorageHealth()).resolves.toEqual({
      healthy: true,
      everRecreated: false,
      recreateCount: 0,
    });
    const page = await client.listDeadLetters("switchboard", undefined, 25);
    expect(page).toEqual({
      remoteName: "switchboard",
      results: [{ id: "dl-1", documentId: "doc-1" }],
    });
    expect(server.requests.at(-1)).toEqual({
      operation: "ReactorInspectionDeadLetters",
      variables: { remoteName: "switchboard", cursor: null, limit: 25 },
    });
  });

  it("serves catch-up status and holds", async () => {
    await expect(client.getCatchUpStatus()).resolves.toEqual({
      consumers: [],
      watermark: null,
    });
    await expect(
      client.listHolds({ remoteName: "switchboard" }),
    ).resolves.toEqual([{ remoteName: "switchboard" }]);
    expect(server.requests.at(-1)?.variables).toEqual({
      remoteName: "switchboard",
      documentId: null,
    });
  });

  it("serves ISyncInspector's exact shape, without the configuration half", async () => {
    const [inspection] = await client.inspectRemotes();

    expect(inspection).toEqual({
      remoteName: "switchboard",
      remoteId: "remote-1",
      inboxCursor: {
        cursorType: "inbox",
        cursorOrdinal: 7,
        lastSyncedAtUtcMs: 1_700_000_000_000,
        liveAckOrdinal: 5,
        liveLatestOrdinal: 9,
      },
      outboxCursor: {
        cursorType: "outbox",
        cursorOrdinal: 3,
        liveAckOrdinal: 3,
        liveLatestOrdinal: 3,
      },
      mailboxDepths: { inbox: 2, outbox: 1, deadLetter: 1 },
      // The lie detector the whole W0.5 surface exists for: "connected" with
      // no successful poll since boot.
      connection: { snapshot: SNAPSHOT, neverSucceeded: true },
    });
    // The configuration rides along on the wire for the sync manager's list,
    // but must not leak into the inspection record's declared shape.
    expect(inspection).not.toHaveProperty("meta");

    const withMeta = await client.inspectRemoteWithMeta("switchboard");
    expect(withMeta.meta.channelConfig?.type).toBe(POLLING_CHANNEL_TYPE);
  });

  it("names the endpoint and the operation when the server errors", async () => {
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: () =>
        Promise.resolve(
          Response.json({ errors: [{ message: "Admin access required" }] }),
        ),
    });

    await expect(client.getQueueState()).rejects.toThrow(
      /Reactor inspection "queueState": Admin access required/,
    );
  });

  it("keeps an HTTP failure's body, which is where a 401 explains itself", async () => {
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: () => Promise.resolve(new Response("no bearer", { status: 401 })),
    });

    await expect(client.getQueueState()).rejects.toThrow(
      /failed at http:\/\/host\.example\/graphql\/inspection: 401 no bearer/,
    );
  });

  it("sends the headers the provider resolves, per request", async () => {
    const seen: string[] = [];
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      headers: () => ({ authorization: `Bearer token-${seen.length}` }),
      fetch: (_input, init) => {
        seen.push(new Headers(init?.headers).get("authorization") ?? "none");
        return Promise.resolve(
          Response.json({ data: { inspection: { catchUpStatus: {} } } }),
        );
      },
    });

    await client.getCatchUpStatus();
    await client.getCatchUpStatus();

    expect(seen).toEqual(["Bearer token-0", "Bearer token-1"]);
  });

  // HTTP header names are case-INSENSITIVE, so merging a provider's headers
  // over the defaults by object spread produces TWO content-type headers
  // whenever the provider spells it differently, and which one the server
  // reads is up to its parser.
  it("lets a provider override a default header instead of sending it twice", async () => {
    let sent: Headers | undefined;
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      headers: () => ({
        "Content-Type": "application/graphql+json",
        Accept: "application/graphql-response+json",
        Authorization: "Bearer t",
      }),
      fetch: (_input, init) => {
        sent = new Headers(init?.headers);
        return Promise.resolve(
          Response.json({ data: { inspection: { catchUpStatus: {} } } }),
        );
      },
    });

    await client.getCatchUpStatus();

    // `Headers.get` joins duplicates with ", ", so a single value is also the
    // proof that nothing was sent twice.
    expect(sent?.get("content-type")).toBe("application/graphql+json");
    expect(sent?.get("accept")).toBe("application/graphql-response+json");
    expect(sent?.get("authorization")).toBe("Bearer t");
  });

  it("decodes an ordinal past 2^31, which the Int-typed first cut could not carry", async () => {
    const BIG = 4_294_967_296;
    const server = fakeInspectionServer({
      remote: {
        inboxCursor: {
          cursorType: "inbox",
          cursorOrdinal: BIG,
          lastSyncedAtUtcMs: null,
          liveAckOrdinal: BIG + 1,
          liveLatestOrdinal: BIG + 2,
        },
      },
      adminEnabled: true,
    });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    const [inspection] = await client.inspectRemotes();
    expect(inspection!.inboxCursor).toEqual({
      cursorType: "inbox",
      cursorOrdinal: BIG,
      liveAckOrdinal: BIG + 1,
      liveLatestOrdinal: BIG + 2,
    });

    // And an operator can NAME such a position when rewinding.
    await client.rewindInboxCursor("switchboard", BIG);
    expect(server.requests.at(-1)?.variables).toEqual({
      remoteName: "switchboard",
      toOrdinal: BIG,
    });
  });

  it("reads storage health from a short cache, not once per poll", async () => {
    const server = fakeInspectionServer();
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    await client.getStorageHealth();
    await client.getStorageHealth();
    await client.getStorageHealth();

    expect(
      server.requests.filter(
        (request) => request.operation === "ReactorInspectionStorageHealth",
      ),
    ).toHaveLength(1);
  });
});

describe("RemoteInspectorClient admin tiers", () => {
  it("refuses every state-changing op by name when the host did not opt in", async () => {
    const server = fakeInspectionServer({ adminEnabled: false });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    const levers: readonly [string, () => Promise<unknown>][] = [
      ["pauseQueue", () => client.pauseQueue()],
      ["resumeQueue", () => client.resumeQueue()],
      ["retryProcessor", () => client.retryProcessor("p-1")],
      ["sweepCatchUp", () => client.sweepCatchUp()],
      ["validateDocument", () => client.validateDocument("doc-1")],
      ["rebuildKeyframes", () => client.rebuildKeyframes("doc-1")],
      ["rebuildSnapshots", () => client.rebuildSnapshots("doc-1")],
      ["triggerPull", () => client.triggerPull("switchboard")],
      ["rewindInboxCursor", () => client.rewindInboxCursor("switchboard", 0)],
      ["resetChannel", () => client.resetChannel("switchboard")],
      ["requeueDeadLetter", () => client.requeueDeadLetter("switchboard", "d")],
      ["clearDeadLetter", () => client.clearDeadLetter("switchboard", "d")],
    ];

    for (const [name, call] of levers) {
      await expect(call(), name).rejects.toThrow(/PH_INSPECTION_ADMIN=true/);
    }
    // No LEVER reached the wire: every request was a re-read of the reported
    // facts, which is what a local "no" costs now -- one round trip to make
    // sure the host was not restarted with the flag since this client last
    // asked, rather than a refusal based on a cache of unbounded age.
    expect(
      new Set(server.requests.map((request) => request.operation)),
    ).toEqual(new Set(["ReactorInspectionInfo"]));
  });

  it("sends the lever once the host opted in", async () => {
    const server = fakeInspectionServer({ adminEnabled: true });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    await client.pauseQueue();
    await client.rewindInboxCursor("switchboard", 4);
    await client.requeueDeadLetter("switchboard", "dl-1");

    expect(server.requests.slice(1)).toEqual([
      { operation: "ReactorInspectionPauseQueue", variables: {} },
      {
        operation: "ReactorInspectionRewindInboxCursor",
        variables: { remoteName: "switchboard", toOrdinal: 4 },
      },
      {
        operation: "ReactorInspectionRequeueDeadLetter",
        variables: { remoteName: "switchboard", id: "dl-1" },
      },
    ]);
  });

  it("holds raw SQL behind its own tier, never behind the admin one", async () => {
    const adminOnly = fakeInspectionServer({ adminEnabled: true });
    const bothOn = fakeInspectionServer({
      adminEnabled: true,
      sqlEnabled: true,
    });

    await expect(
      new RemoteInspectorClient({
        url: "http://host.example/graphql/inspection",
        fetch: adminOnly.fetchImpl,
      }).queryDb("select 1"),
    ).rejects.toThrow(/PH_INSPECTION_SQL=true/);

    await expect(
      new RemoteInspectorClient({
        url: "http://host.example/graphql/inspection",
        fetch: bothOn.fetchImpl,
      }).queryDb("select 1 as one", ["a"]),
    ).resolves.toEqual([{ one: 1 }]);
    expect(bothOn.requests.at(-1)).toEqual({
      operation: "ReactorInspectionQueryDb",
      variables: { sql: "select 1 as one", params: ["a"] },
    });
  });

  it("reuses the reported facts while they are fresh", async () => {
    const server = fakeInspectionServer({ adminEnabled: true });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    await client.pauseQueue();
    await client.resumeQueue();

    expect(
      server.requests.filter((r) => r.operation === "ReactorInspectionInfo"),
    ).toHaveLength(1);
  });

  // The documented operator flow: restart the Switchboard with the flag and
  // the levers go live under the SAME monitor handle. A client that cached the
  // tiers at provision time -- the first cut of W3.2 -- dead-ends it.
  it("re-reads the tiers before refusing, so a host restarted with the flag works", async () => {
    const server = fakeInspectionServer({ adminEnabled: false });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    await expect(client.pauseQueue()).rejects.toThrow(/PH_INSPECTION_ADMIN/);

    // The operator restarts that host with the flag on.
    server.info.adminEnabled = true;

    await client.pauseQueue();
    expect(server.requests.at(-1)?.operation).toBe(
      "ReactorInspectionPauseQueue",
    );
    expect(client.reportedInfo?.adminEnabled).toBe(true);
  });

  // And the other direction, which a cache-forever client got wrong just as
  // badly: the lever is offered, the far side refuses it, and nothing updates
  // the picture the UI's gate is drawn from.
  it("corrects itself when the far side refuses a lever it thought was served", async () => {
    const server = fakeInspectionServer({
      adminEnabled: true,
      refuseMutations: true,
    });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });
    await client.info();

    // The host is restarted WITHOUT the flag; this client does not know yet.
    server.info.adminEnabled = false;

    await expect(client.pauseQueue()).rejects.toThrow(/PH_INSPECTION_ADMIN/);

    // The refusal carried extensions.code FORBIDDEN, so the facts were
    // re-read: the gate now closes with the real reason instead of offering
    // the lever again.
    expect(client.reportedInfo?.adminEnabled).toBe(false);
    await expect(client.pauseQueue()).rejects.toThrow(
      /does not serve admin inspection ops/,
    );
  });

  it("re-reads on demand, for an operator who will not wait for the TTL", async () => {
    const server = fakeInspectionServer({ adminEnabled: false });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    expect((await client.info()).adminEnabled).toBe(false);
    server.info.adminEnabled = true;

    expect((await client.refreshInfo()).adminEnabled).toBe(true);
    expect(client.reportedInfo?.adminEnabled).toBe(true);
  });

  it("shares one in-flight read between concurrent callers", async () => {
    const server = fakeInspectionServer({ adminEnabled: true });
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });

    await Promise.all([
      client.refreshInfo(),
      client.refreshInfo(),
      client.refreshInfo(),
    ]);

    expect(
      server.requests.filter((r) => r.operation === "ReactorInspectionInfo"),
    ).toHaveLength(1);
  });
});

describe("RemoteSyncManagerClient", () => {
  it("serves the remote list and its reported connection state after a seed", async () => {
    const server = fakeInspectionServer();
    const client = new RemoteInspectorClient({
      url: "http://host.example/graphql/inspection",
      fetch: server.fetchImpl,
    });
    const syncManager = new RemoteSyncManagerClient(client);

    expect(syncManager.list()).toEqual([]);
    await syncManager.startup();

    const [remote] = syncManager.list();
    expect(remote!.meta.name).toBe("switchboard");
    // DriveCollectionId arrives prototype-less over JSON and is rehydrated,
    // so `key` (a method on the class) works again.
    expect(remote!.meta.collectionId.driveId).toBe("drive-a");
    expect(remote!.meta.collectionId.key).toBeTypeOf("string");
    expect(remote!.channel.getConnectionState()).toEqual(SNAPSHOT);
    // No live sync operations cross the wire; the depths in the inspection do.
    expect(remote!.channel.inbox.items).toEqual([]);
    expect(syncManager.getByName("switchboard")).toBe(remote);
  });

  it("refreshes the list from the same request that answers an inspection", async () => {
    const server = fakeInspectionServer();
    const syncManager = new RemoteSyncManagerClient(
      new RemoteInspectorClient({
        url: "http://host.example/graphql/inspection",
        fetch: server.fetchImpl,
      }),
    );

    const inspected = await syncManager.inspectRemotes();

    expect(inspected).toHaveLength(1);
    expect(inspected[0]).not.toHaveProperty("meta");
    expect(syncManager.list()).toHaveLength(1);
    expect(
      server.requests.filter((r) => r.operation === "ReactorInspectionRemotes"),
    ).toHaveLength(1);
  });

  // Wire data, not a trusted record: the subgraph serves a remote's
  // configuration through a JSON scalar, and a remote that vanished between
  // the inspection and the server's own lookup comes back as identity alone.
  // A channel config with no `parameters` used to take the whole remotes list
  // down with a TypeError, in a view whose entire purpose is diagnosing that
  // reactor.
  it("renders a remote whose channel config arrived half-formed", async () => {
    const server = fakeInspectionServer({
      remote: {
        meta: { id: "remote-1", channelConfig: { type: "polling" } },
      },
    });
    const syncManager = new RemoteSyncManagerClient(
      new RemoteInspectorClient({
        url: "http://host.example/graphql/inspection",
        fetch: server.fetchImpl,
      }),
    );

    await syncManager.startup();

    const [remote] = syncManager.list();
    expect(remote!.meta.name).toBe("switchboard");
    expect(remote!.meta.channelConfig).toEqual({
      type: "polling",
      parameters: {},
    });
    expect(remote!.meta.collectionId.branch).toBe("main");
    expect(remote!.channel.getConnectionState()).toEqual(SNAPSHOT);
  });

  it("renders a remote the server could only identify", async () => {
    const server = fakeInspectionServer({
      remote: { meta: { id: "remote-1" } },
    });
    const syncManager = new RemoteSyncManagerClient(
      new RemoteInspectorClient({
        url: "http://host.example/graphql/inspection",
        fetch: server.fetchImpl,
      }),
    );

    await syncManager.startup();

    const [remote] = syncManager.list();
    expect(remote!.meta.channelConfig).toEqual({
      type: "unknown",
      parameters: {},
    });
    expect(remote!.meta.filter.branch).toBe("main");
  });

  it("refuses to reconfigure the far side, by name", async () => {
    const server = fakeInspectionServer({ adminEnabled: true });
    const syncManager = new RemoteSyncManagerClient(
      new RemoteInspectorClient({
        url: "http://host.example/graphql/inspection",
        fetch: server.fetchImpl,
      }),
    );

    await expect(syncManager.add()).rejects.toThrow(
      /Adding a remote is not served over the remote inspection surface/,
    );
    await expect(syncManager.remove()).rejects.toThrow(/Removing a remote/);
    await expect(syncManager.bindRemote()).rejects.toThrow(/Binding a remote/);
    await expect(syncManager.setPeerManifest()).rejects.toThrow(
      /Setting a peer manifest/,
    );
    expect(() => syncManager.agreement()).toThrow(/Peer agreement/);
    expect(() => syncManager.localManifest()).toThrow(
      /The local peer manifest/,
    );
  });
});

describe("provisioning a remote reactor", () => {
  it("derives the capability row from what the reactor reported", async () => {
    const server = fakeInspectionServer({
      workflows: true,
      syncChannels: [POLLING_CHANNEL_TYPE],
    });

    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));

    expect(reactor.kind).toBe("remote");
    expect(reactor.endpoint).toBe("http://host.example/graphql/inspection");
    expect(reactor.capabilities).toEqual({
      hosting: "remote",
      storage: { kind: "remote", durable: true },
      processors: true,
      // Reported, not assumed: a Node host MAY run the engine, this one does.
      workflows: true,
      // W3.2 raises this from "none": the subgraph is a real transport.
      inspection: "rpc",
      // The far side's own channel type. A descriptor-only derivation would
      // have claimed "gql", which this reactor's factory refuses.
      syncChannels: [POLLING_CHANNEL_TYPE],
      selfHeal: false,
    });
    expect(reactor.capabilities.syncChannels).not.toContain(GQL_CHANNEL_TYPE);
    expect(reactor.capabilities.syncChannels).not.toContain(LOCAL_CHANNEL_TYPE);
  });

  it("reports a host that serves reads only, so the UI can disable its levers", async () => {
    const reactor: ManagedRemoteReactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.serverInfo.adminEnabled).toBe(false);
    expect(reactor.serverInfo.sqlEnabled).toBe(false);
    expect(reactor.serverInfo.storageKind).toBe("postgres");
  });

  it("seeds the remote list at provision time, so the first Sync render is not empty", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.syncManager.list()).toHaveLength(1);
  });

  it("wires the handle's inspection surfaces to the remote client", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.inspector).toBe(reactor.remoteInspector);
    expect(reactor.dbQuery).toBe(reactor.remoteInspector);
    await expect(reactor.inspector.getQueueState()).resolves.toMatchObject({
      isPaused: true,
    });
  });

  it("refuses the two surfaces it does not wire, saying what to use instead", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(() => reactor.client.get("doc-1")).toThrow(
      /Document operation "client.get" is not wired/,
    );
    // Nested namespaces refuse too, naming the path that was reached.
    expect(() =>
      reactor.client.drives.create({ global: { name: "nope" } }),
    ).toThrow(/"client.drives.create" is not wired/);
    expect(() => reactor.events.subscribe(1, () => {})).toThrow(
      /The reactor event bus is not wired/,
    );
  });

  // Refusing a document operation is the point; refusing to be PRINTED is a
  // trap for whoever is diagnosing something else. A log line, an error
  // report or a devtools expansion that happens to include the handle must
  // not throw while trying to say what it is.
  it("lets the unwired handles be described, not just refused", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    // Through a template literal, so the assertion exercises the same
    // ToPrimitive path a log line or an error message would.
    const text = (value: unknown): string => `${value as string}`;

    expect(() => JSON.stringify(reactor.client)).not.toThrow();
    expect(() =>
      JSON.stringify({ client: reactor.client.drives }),
    ).not.toThrow();
    expect(text(reactor.client)).toMatch(/unwired client/);
    expect(text(reactor.client.drives)).toMatch(/unwired client\.drives/);
    expect(JSON.parse(JSON.stringify(reactor.client))).toMatch(
      /http:\/\/host\.example\/graphql\/inspection/,
    );
    // Still refuses the thing it exists to refuse.
    expect(() => reactor.client.get("doc-1")).toThrow(/is not wired/);
  });

  it("reports the tiers the host NOW serves, not the ones it served at provision time", async () => {
    const server = fakeInspectionServer({ adminEnabled: false });
    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));

    expect(reactor.serverInfo.adminEnabled).toBe(false);

    // The operator restarts that Switchboard with PH_INSPECTION_ADMIN=true and
    // asks the monitor to re-check it.
    server.info.adminEnabled = true;
    const refreshed = await reactor.refreshServerInfo();

    expect(refreshed.adminEnabled).toBe(true);
    expect(reactor.serverInfo.adminEnabled).toBe(true);
    // And the client agrees: the lever now goes to the wire instead of being
    // refused locally.
    await reactor.inspector.pauseQueue();
    expect(server.requests.at(-1)?.operation).toBe(
      "ReactorInspectionPauseQueue",
    );
  });

  it("keeps the capability row frozen at provision time, tiers or not", async () => {
    const server = fakeInspectionServer({ workflows: false });
    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));

    // A reactor built with different channel factories or a workflow engine is
    // a DIFFERENT reactor, and the contract a router caches must not change
    // under it: re-provision for that, unlike the host's admin posture.
    server.info.workflows = true;
    await reactor.refreshServerInfo();

    expect(reactor.serverInfo.workflows).toBe(true);
    expect(reactor.capabilities.workflows).toBe(false);
    expect(Object.isFrozen(reactor.capabilities)).toBe(true);
  });

  it("fails at provision time when the endpoint is not a reactor", async () => {
    await expect(
      provisionRemote(
        remoteDescriptor(() =>
          Promise.resolve(new Response("nope", { status: 404 })),
        ),
      ),
    ).rejects.toThrow(/http:\/\/host\.example\/graphql\/inspection: 404 nope/);
  });

  it("refuses a remote descriptor with no remote config", async () => {
    await expect(
      provisionRemote({ kind: "remote", name: "nowhere" }),
    ).rejects.toThrow(/carries no "remote" config/);
  });

  it("is reachable through provision(), which used to refuse the kind", async () => {
    const reactor = await provision(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.kind).toBe("remote");
    await reactor.kill();
    expect(reactor.isShutdown()).toBe(true);
  });
});
