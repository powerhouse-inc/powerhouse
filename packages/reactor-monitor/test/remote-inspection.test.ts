import {
  deriveConnectionHealth,
  DRIVE_AUTH_ERROR_MESSAGES,
  GQL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  type ConnectionStateSnapshot,
  type WireInspectorAccess,
  type WireReactorInfo,
} from "@powerhousedao/reactor";
import { subgraphUrlFromGraphqlUrl } from "@powerhousedao/reactor-browser/graphql-client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FORBIDDEN_CODE,
  inspectionEndpoint,
  InspectionRequestError,
  provision,
  provisionRemote,
  RemoteInspectorClient,
  RemoteSyncManagerClient,
  type ReactorDescriptor,
} from "../src/index.js";

// A stand-in subgraph; remote-operations.test.ts checks the documents against the real SDL.

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

const READ_ONLY: WireInspectorAccess = { admin: false, sql: false };

const QUEUE_JOB = {
  id: "job-1",
  kind: "mutation",
  documentId: "doc-1",
  scope: "global",
  branch: "main",
  status: "pending",
  actionCount: 1,
  operationCount: 0,
  retryCount: 0,
};

const DEAD_LETTER = {
  id: "dl-1",
  jobId: "job-9",
  documentId: "doc-1",
  branch: "main",
  scopes: ["global"],
  errorType: "Error",
  errorMessage: "boom",
  operationCount: 2,
};

// Served to any caller; every other root field is an operator read.
const OPEN_READS = new Set([
  "ReactorInspectionInfo",
  "ReactorInspectionDocumentModels",
  "ReactorInspectionDrives",
  "ReactorInspectionDriveIntegrity",
  "ReactorInspectionValidateDocument",
]);

type FakeServerOptions = {
  /** `null` is what the subgraph serves a caller that is not an admin. */
  access?: WireInspectorAccess | null;
  workflows?: boolean;
  syncChannels?: readonly string[];
  remote?: Record<string, unknown>;
  /** Whether the host serves `inspection-admin` to this caller. */
  levers?: boolean;
};

/** Answers the inspection documents by operation name, recording each request. */
function fakeInspectionServer(options: FakeServerOptions = {}) {
  const requests: RecordedRequest[] = [];
  const info: { -readonly [K in keyof WireReactorInfo]: WireReactorInfo[K] } = {
    storage: {
      engine: "postgres",
      persistence: "server",
      durable: true,
      selfHeal: false,
    },
    workflows: options.workflows ?? false,
    syncChannels: options.syncChannels ?? [POLLING_CHANNEL_TYPE],
    access: options.access === undefined ? READ_ONLY : options.access,
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

  const answers: Partial<Record<string, () => unknown>> = {
    ReactorInspectionInfo: () => ({ inspection: { info } }),
    ReactorInspectionDocumentModels: () => ({
      inspection: {
        documentModels: [
          {
            documentType: "powerhouse/document-drive",
            name: "DocumentDrive",
            version: 1,
            supportedVersions: [1],
          },
          {
            documentType: "sky/ledger",
            name: "Ledger",
            version: 2,
            supportedVersions: [1, 2],
          },
        ],
      },
    }),
    ReactorInspectionDrives: () => ({
      inspection: {
        drives: {
          results: [
            {
              driveId: "drive-a",
              name: "Accounts",
              branch: "main",
              collectionId: "drive.main.drive-a",
              documentType: "powerhouse/document-drive",
              nodeCount: 3,
              fileCount: 2,
              folderCount: 1,
              otherNodeCount: 0,
              unreadableNodeCount: 0,
              icon: null,
            },
          ],
          nextCursor: "25",
        },
      },
    }),
    ReactorInspectionDriveIntegrity: () => ({
      inspection: {
        driveIntegrity: {
          driveId: "drive-a",
          checkedNodeCount: 2,
          totalFileNodeCount: 2,
          missingDocuments: [{ id: "doc-x", documentType: "sky/ledger" }],
          unsupportedTypes: [],
        },
      },
    }),
    ReactorInspectionValidateDocument: () => ({
      inspection: {
        validateDocument: {
          documentId: "doc-1",
          isConsistent: false,
          keyframeIssues: [
            {
              scope: "global",
              branch: "main",
              revision: 4,
              keyframeHash: "a",
              replayedHash: "b",
            },
          ],
          snapshotIssues: [],
          streamOrderIssues: [],
        },
      },
    }),
    ReactorInspectionAttachmentInfo: () => ({
      inspection: {
        attachmentInfo: {
          present: true,
          storeKind: "kysely",
          hasReplicator: false,
          replicatorRunning: false,
          backlogScanned: false,
          refsSeen: 0,
          held: 0,
          bytesHeld: 4096,
          queued: 0,
          fetching: 0,
          pendingFetches: 0,
          waiting: 0,
          notFound: 0,
          failed: 0,
          lastError: null,
        },
      },
    }),
    ReactorInspectionQueueState: () => ({
      inspection: {
        queueState: {
          isPaused: true,
          totalPending: 1,
          totalExecuting: 0,
          pendingJobs: [QUEUE_JOB],
          executingJobs: [],
        },
      },
    }),
    ReactorInspectionProcessors: () => ({
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
            floor: 0,
            clearable: true,
            runFrom: 12,
            phase: "errored",
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
            floor: 3,
            clearable: false,
            runFrom: 3,
            phase: "catching-up",
          },
        ],
      },
    }),
    ReactorInspectionCatchUp: () => ({
      inspection: { catchUpStatus: { consumers: [], watermark: null } },
    }),
    ReactorInspectionStorageHealth: () => ({
      inspection: {
        storageHealth: {
          tracked: true,
          healthy: true,
          everRecreated: false,
          recreateCount: 0,
        },
      },
    }),
    ReactorInspectionRemotes: () => ({ inspection: { remotes: [wireRemote] } }),
    ReactorInspectionRemote: () => ({ inspection: { remote: wireRemote } }),
    ReactorInspectionDeadLetters: () => ({
      inspection: {
        deadLetters: {
          remoteName: REMOTE_META.name,
          results: [DEAD_LETTER],
          nextCursor: null,
        },
      },
    }),
  };

  const levers = { served: options.levers ?? false };
  const fetchImpl: typeof fetch = (input, init) => {
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {
      query: string;
      variables: Record<string, unknown>;
    };
    const name = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1];
    if (!name) {
      throw new Error(`unnamed operation: ${body.query}`);
    }
    requests.push({ operation: name, variables: body.variables });
    if (String(input).endsWith("/inspection-admin")) {
      if (!levers.served) {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }
      return Promise.resolve(
        Response.json({
          data:
            name === "ReactorInspectionAdminAccess"
              ? { inspectionAdmin: { processors: true } }
              : { [name]: true },
        }),
      );
    }
    if (info.access === null && !OPEN_READS.has(name)) {
      return Promise.resolve(
        Response.json({
          errors: [
            {
              message: `${DRIVE_AUTH_ERROR_MESSAGES.forbidden} to read the reactor's operational state`,
              extensions: { code: "FORBIDDEN" },
            },
          ],
          data: null,
        }),
      );
    }
    const answer = answers[name];
    if (answer === undefined) {
      return Promise.resolve(
        Response.json({ errors: [{ message: `no stub for ${name}` }] }),
      );
    }
    return Promise.resolve(Response.json({ data: answer() }));
  };

  return { fetchImpl, requests, info, wireRemote, levers };
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

function clientOf(fetchImpl: typeof fetch): RemoteInspectorClient {
  return new RemoteInspectorClient({
    url: "http://host.example/graphql/inspection",
    fetch: fetchImpl,
  });
}

describe("inspectionEndpoint", () => {
  it("derives the subgraph mount from the reactor's GraphQL url", () => {
    expect(inspectionEndpoint("http://host/graphql")).toBe(
      "http://host/graphql/inspection",
    );
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
    client = clientOf(server.fetchImpl);
  });

  it("decodes the reactor's info, nested storage and access included", async () => {
    await expect(client.info()).resolves.toEqual({
      storage: {
        engine: "postgres",
        persistence: "server",
        durable: true,
        selfHeal: false,
      },
      workflows: false,
      syncChannels: [POLLING_CHANNEL_TYPE],
      access: { admin: false, sql: false },
    });
    expect(client.reportedInfo?.storage.engine).toBe("postgres");
  });

  it("keeps a null access, which is what a non-admin caller is served", async () => {
    const server = fakeInspectionServer({ access: null });
    await expect(clientOf(server.fetchImpl).info()).resolves.toMatchObject({
      access: null,
    });
  });

  it("decodes the registered document models over the subgraph", async () => {
    await expect(client.listDocumentModels()).resolves.toEqual([
      {
        documentType: "powerhouse/document-drive",
        name: "DocumentDrive",
        version: 1,
        supportedVersions: [1],
      },
      {
        documentType: "sky/ledger",
        name: "Ledger",
        version: 2,
        supportedVersions: [1, 2],
      },
    ]);
    expect(server.requests.at(-1)?.operation).toBe(
      "ReactorInspectionDocumentModels",
    );
  });

  it("decodes the drive list, dropping a null icon and carrying the cursor", async () => {
    await expect(client.listDrives(undefined, 25)).resolves.toEqual({
      results: [
        {
          driveId: "drive-a",
          name: "Accounts",
          branch: "main",
          collectionId: "drive.main.drive-a",
          documentType: "powerhouse/document-drive",
          nodeCount: 3,
          fileCount: 2,
          folderCount: 1,
          otherNodeCount: 0,
          unreadableNodeCount: 0,
          icon: undefined,
        },
      ],
      nextCursor: "25",
    });
    expect(server.requests.at(-1)).toEqual({
      operation: "ReactorInspectionDrives",
      variables: { cursor: null, limit: 25 },
    });
  });

  it("decodes a single-snapshot drive-integrity walk on the given branch", async () => {
    const result = await client.checkDriveIntegrity("drive-a", "main");
    expect(result).toEqual({
      driveId: "drive-a",
      checkedNodeCount: 2,
      totalFileNodeCount: 2,
      missingDocuments: [{ id: "doc-x", documentType: "sky/ledger" }],
      unsupportedTypes: [],
    });
    expect(server.requests.at(-1)).toEqual({
      operation: "ReactorInspectionDriveIntegrity",
      variables: { driveId: "drive-a", branch: "main" },
    });
  });

  it("validates a document through a query", async () => {
    const result = await client.validateDocument("doc-1");
    expect(result.isConsistent).toBe(false);
    expect(result.keyframeIssues).toEqual([
      {
        scope: "global",
        branch: "main",
        revision: 4,
        keyframeHash: "a",
        replayedHash: "b",
      },
    ]);
    expect(server.requests.at(-1)).toEqual({
      operation: "ReactorInspectionValidateDocument",
      variables: { documentId: "doc-1", branch: null },
    });
  });

  it("decodes attachment info, dropping an absent last error", async () => {
    await expect(client.getAttachmentInfo()).resolves.toEqual({
      present: true,
      storeKind: "kysely",
      hasReplicator: false,
      replicatorRunning: false,
      backlogScanned: false,
      refsSeen: 0,
      held: 0,
      bytesHeld: 4096,
      queued: 0,
      fetching: 0,
      pendingFetches: 0,
      waiting: 0,
      notFound: 0,
      failed: 0,
      lastError: undefined,
    });
  });

  it("serves queue state as the wire record", async () => {
    await expect(client.getQueueState()).resolves.toEqual({
      isPaused: true,
      totalPending: 1,
      totalExecuting: 0,
      pendingJobs: [QUEUE_JOB],
      executingJobs: [],
    });
  });

  it("carries a processor's replay floor and whether it can be cleared", async () => {
    const processors = await client.getProcessors();

    expect(processors.map((p) => [p.floor, p.clearable])).toEqual([
      [0, true],
      [3, false],
    ]);
  });

  it("carries a processor's run start and phase", async () => {
    const processors = await client.getProcessors();

    expect(processors.map((p) => [p.runFrom, p.phase])).toEqual([
      [12, "errored"],
      [3, "catching-up"],
    ]);
  });

  it("rebuilds a processor's error Date from epoch milliseconds", async () => {
    const processors = await client.getProcessors();

    expect(processors).toHaveLength(2);
    expect(processors[0]!.lastErrorTimestamp).toBeInstanceOf(Date);
    expect(processors[0]!.lastErrorTimestamp?.getTime()).toBe(LAST_ERROR_MS);
    expect(processors[0]!.lastError).toBe("boom");
    expect(processors[1]!.lastError).toBeUndefined();
    expect(processors[1]!.lastErrorTimestamp).toBeUndefined();
  });

  it("reads storage health with its tracked flag", async () => {
    await expect(client.getStorageHealth()).resolves.toEqual({
      tracked: true,
      healthy: true,
      everRecreated: false,
      recreateCount: 0,
    });
  });

  it("serves a dead-letter page as the wire record", async () => {
    await expect(
      client.listDeadLetters("switchboard", undefined, 25),
    ).resolves.toEqual({
      remoteName: "switchboard",
      results: [DEAD_LETTER],
      nextCursor: null,
    });
    expect(server.requests.at(-1)).toEqual({
      operation: "ReactorInspectionDeadLetters",
      variables: { remoteName: "switchboard", cursor: null, limit: 25 },
    });
  });

  it("serves catch-up status", async () => {
    await expect(client.getCatchUpStatus()).resolves.toEqual({
      consumers: [],
      watermark: null,
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
      connection: { snapshot: SNAPSHOT, neverSucceeded: true },
    });
    expect(inspection).not.toHaveProperty("meta");

    const withMeta = await client.inspectRemoteWithMeta("switchboard");
    expect(withMeta.meta.channelConfig?.type).toBe(POLLING_CHANNEL_TYPE);
  });

  it("names the endpoint and the operation when the server errors", async () => {
    const client = clientOf(() =>
      Promise.resolve(
        Response.json({ errors: [{ message: "Admin access required" }] }),
      ),
    );

    await expect(client.getQueueState()).rejects.toThrow(
      /Reactor inspection "queueState": Admin access required/,
    );
  });

  it("keeps an HTTP failure's body, which is where a 401 explains itself", async () => {
    const client = clientOf(() =>
      Promise.resolve(new Response("no bearer", { status: 401 })),
    );

    await expect(client.getQueueState()).rejects.toThrow(
      /failed at http:\/\/host\.example\/graphql\/inspection: 401 no bearer/,
    );
  });

  it("surfaces an operator read refused to a non-admin as FORBIDDEN, by name", async () => {
    const client = clientOf(fakeInspectionServer({ access: null }).fetchImpl);

    const error = await client.getQueueState().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InspectionRequestError);
    expect((error as InspectionRequestError).code).toBe(FORBIDDEN_CODE);
    expect((error as Error).message).toMatch(
      /Reactor inspection "queueState": Forbidden/,
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

    // `Headers.get` joins duplicates with ", ", so one value means one header.
    expect(sent?.get("content-type")).toBe("application/graphql+json");
    expect(sent?.get("accept")).toBe("application/graphql-response+json");
    expect(sent?.get("authorization")).toBe("Bearer t");
  });

  it("decodes an ordinal past 2^31", async () => {
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
    });

    const [inspection] = await clientOf(server.fetchImpl).inspectRemotes();
    expect(inspection!.inboxCursor).toEqual({
      cursorType: "inbox",
      cursorOrdinal: BIG,
      liveAckOrdinal: BIG + 1,
      liveLatestOrdinal: BIG + 2,
    });
  });

  it("reads storage health from a short cache, not once per poll", async () => {
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

describe("RemoteSyncManagerClient", () => {
  it("serves the remote list and its reported connection state after a seed", async () => {
    const syncManager = new RemoteSyncManagerClient(
      clientOf(fakeInspectionServer().fetchImpl),
    );

    expect(syncManager.list()).toEqual([]);
    await syncManager.startup();

    const [remote] = syncManager.list();
    expect(remote!.meta.name).toBe("switchboard");
    // DriveCollectionId is rehydrated, so its methods work again.
    expect(remote!.meta.collectionId.driveId).toBe("drive-a");
    expect(remote!.meta.collectionId.key).toBeTypeOf("string");
    expect(remote!.channel.getConnectionState()).toEqual(SNAPSHOT);
    expect(remote!.channel.inbox.items).toEqual([]);
    expect(syncManager.getByName("switchboard")).toBe(remote);
  });

  it("refreshes the list from the same request that answers an inspection", async () => {
    const server = fakeInspectionServer();
    const syncManager = new RemoteSyncManagerClient(clientOf(server.fetchImpl));

    const inspected = await syncManager.inspectRemotes();

    expect(inspected).toHaveLength(1);
    expect(inspected[0]).not.toHaveProperty("meta");
    expect(syncManager.list()).toHaveLength(1);
    expect(
      server.requests.filter((r) => r.operation === "ReactorInspectionRemotes"),
    ).toHaveLength(1);
  });

  it("serves dead letters as wire records", async () => {
    const syncManager = new RemoteSyncManagerClient(
      clientOf(fakeInspectionServer().fetchImpl),
    );

    const page = await syncManager.listDeadLetters("switchboard");
    expect(page.results).toEqual([DEAD_LETTER]);
  });

  it("renders a remote whose channel config arrived half-formed", async () => {
    const server = fakeInspectionServer({
      remote: {
        meta: { id: "remote-1", channelConfig: { type: "polling" } },
      },
    });
    const syncManager = new RemoteSyncManagerClient(clientOf(server.fetchImpl));

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
    const syncManager = new RemoteSyncManagerClient(clientOf(server.fetchImpl));

    await syncManager.startup();

    const [remote] = syncManager.list();
    expect(remote!.meta.channelConfig).toEqual({
      type: "unknown",
      parameters: {},
    });
    expect(remote!.meta.filter.branch).toBe("main");
  });

  it("refuses anything that would change the far side, by name", async () => {
    const server = fakeInspectionServer();
    const syncManager = new RemoteSyncManagerClient(clientOf(server.fetchImpl));
    await syncManager.startup();
    const before = server.requests.length;

    await expect(syncManager.add()).rejects.toThrow(
      /Adding a remote is not served by the read-only inspection subgraph at http:\/\/host\.example\/graphql\/inspection/,
    );
    await expect(syncManager.remove()).rejects.toThrow(/Removing a remote/);
    await expect(syncManager.bindRemote()).rejects.toThrow(/Binding a remote/);
    await expect(syncManager.setPeerManifest()).rejects.toThrow(
      /Setting a peer manifest/,
    );
    await expect(syncManager.listHolds()).rejects.toThrow(/Sync holds/);
    expect(() => syncManager.triggerPull("switchboard")).toThrow(
      /Pulling remote "switchboard"/,
    );
    expect(() => syncManager.list()[0]!.channel.triggerPull()).toThrow(
      /Pulling remote "switchboard"/,
    );
    expect(() => syncManager.agreement()).toThrow(/Peer agreement/);
    expect(() => syncManager.localManifest()).toThrow(
      /The local peer manifest/,
    );
    expect(server.requests.length).toBe(before);
  });
});

describe("provisioning a remote reactor", () => {
  it("carries reach and the info the reactor reported", async () => {
    const server = fakeInspectionServer({
      workflows: true,
      syncChannels: [POLLING_CHANNEL_TYPE],
    });

    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));

    expect(reactor.kind).toBe("remote");
    expect(reactor.endpoint).toBe("http://host.example/graphql/inspection");
    expect(reactor.reach).toEqual({ hosting: "remote", inspection: "rpc" });
    expect(reactor.info).toEqual({
      storage: {
        engine: "postgres",
        persistence: "server",
        durable: true,
        selfHeal: false,
      },
      workflows: true,
      syncChannels: [POLLING_CHANNEL_TYPE],
      access: { admin: false, sql: false },
    });
    expect(reactor.info.syncChannels).not.toContain(GQL_CHANNEL_TYPE);
  });

  it("has no admin, dbQuery or syncAdmin, even for an admin caller", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(
        fakeInspectionServer({ access: { admin: true, sql: true } }).fetchImpl,
      ),
    );

    expect(reactor.admin).toBeUndefined();
    expect(reactor.dbQuery).toBeUndefined();
    expect(reactor.syncAdmin).toBeUndefined();
  });

  it("offers no processor levers when the host does not serve inspection-admin", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.processorLevers).toBeUndefined();
  });

  it("reruns a processor through inspection-admin, with the descriptor's bearer", async () => {
    const server = fakeInspectionServer({ levers: true });
    const seen: string[] = [];
    const reactor = await provisionRemote(
      remoteDescriptor(
        (input, init) => {
          seen.push(
            `${String(input)} ${new Headers(init?.headers).get("authorization")}`,
          );
          return server.fetchImpl(input, init);
        },
        { headers: () => ({ authorization: "Bearer admin" }) },
      ),
    );

    await reactor.processorLevers!.rerunProcessor("f-1:drive-a:0", {
      clear: false,
      fromOrdinal: 7,
    });

    expect(server.requests.at(-1)).toEqual({
      operation: "ReactorInspectionRerunProcessor",
      variables: { processorId: "f-1:drive-a:0", clear: false, fromOrdinal: 7 },
    });
    expect(seen.at(-1)).toBe(
      "http://host.example/graphql/inspection-admin Bearer admin",
    );
  });

  it("picks the levers up on a re-check once the host serves them", async () => {
    const server = fakeInspectionServer();
    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));
    expect(reactor.processorLevers).toBeUndefined();

    server.levers.served = true;
    await reactor.refreshInfo();

    expect(reactor.processorLevers).toBeDefined();
  });

  it("surfaces the GraphQL base and inspection auth, so a sibling subgraph derives", async () => {
    const headers = () => ({ authorization: "Bearer t" });
    const server = fakeInspectionServer();
    const reactor = await provisionRemote(
      remoteDescriptor(server.fetchImpl, { headers }),
    );

    expect(reactor.url).toBe("http://host.example/graphql");
    expect(subgraphUrlFromGraphqlUrl(reactor.url, "workflow-runtime")).toBe(
      "http://host.example/graphql/workflow-runtime",
    );
    expect(reactor.headers).toBe(headers);
    expect(reactor.fetch).toBe(server.fetchImpl);
  });

  it("sends the descriptor's bearer with every inspection request", async () => {
    const seen: (string | null)[] = [];
    const server = fakeInspectionServer();
    const reactor = await provisionRemote(
      remoteDescriptor(
        (input, init) => {
          seen.push(new Headers(init?.headers).get("authorization"));
          return server.fetchImpl(input, init);
        },
        { headers: () => ({ Authorization: "Bearer secret" }) },
      ),
    );
    await reactor.inspector.getQueueState();

    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen)).toEqual(new Set(["Bearer secret"]));
  });

  it("seeds the remote list at provision time, so the first Sync render is not empty", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.syncManager.list()).toHaveLength(1);
  });

  it("attaches a non-admin caller without asking for operator reads", async () => {
    const server = fakeInspectionServer({ access: null });

    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));

    expect(reactor.info.access).toBeNull();
    expect(reactor.admin).toBeUndefined();
    expect(reactor.dbQuery).toBeUndefined();
    expect(reactor.syncManager.list()).toEqual([]);
    expect(server.requests.map((r) => r.operation)).toEqual([
      "ReactorInspectionInfo",
    ]);
    await expect(reactor.inspector.getQueueState()).rejects.toThrow(
      /"queueState": Forbidden/,
    );
    await expect(reactor.syncManager.inspectRemotes()).rejects.toMatchObject({
      code: FORBIDDEN_CODE,
    });
    await expect(reactor.inspector.listDrives()).resolves.toMatchObject({
      nextCursor: "25",
    });
  });

  it("wires the handle's inspector to the remote client", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.inspector).toBeInstanceOf(RemoteInspectorClient);
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
    expect(() =>
      reactor.client.drives.create({ global: { name: "nope" } }),
    ).toThrow(/"client.drives.create" is not wired/);
    expect(() => reactor.events.subscribe(1, () => {})).toThrow(
      /The reactor event bus is not wired/,
    );
  });

  it("lets the unwired handles be described, not just refused", async () => {
    const reactor = await provisionRemote(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

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
    expect(() => reactor.client.get("doc-1")).toThrow(/is not wired/);
  });

  it("re-reads info on refreshInfo and shows the latest answer", async () => {
    const server = fakeInspectionServer({ access: null });
    const reactor = await provisionRemote(remoteDescriptor(server.fetchImpl));
    expect(reactor.info.access).toBeNull();

    server.info.access = READ_ONLY;
    server.info.workflows = true;
    const refreshed = await reactor.refreshInfo();

    expect(refreshed.access).toEqual(READ_ONLY);
    expect(reactor.info.access).toEqual(READ_ONLY);
    expect(reactor.info.workflows).toBe(true);
    expect(reactor.reach).toEqual({ hosting: "remote", inspection: "rpc" });
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

  it("is reachable through provision()", async () => {
    const reactor = await provision(
      remoteDescriptor(fakeInspectionServer().fetchImpl),
    );

    expect(reactor.kind).toBe("remote");
    await reactor.kill();
    expect(reactor.isShutdown()).toBe(true);
  });
});
