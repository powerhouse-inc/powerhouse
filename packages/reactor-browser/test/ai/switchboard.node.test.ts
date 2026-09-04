import {
  DriveCollectionId,
  type ISyncManager,
  type Remote,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  SWITCHBOARD_INTROSPECTION_QUERY,
  SWITCHBOARD_SCHEMA_TOOL_NAME,
  createSwitchboardSchemaTool,
  resolveDriveSwitchboard,
  summarizeIntrospectionSchema,
} from "../../src/ai/switchboard.js";

function makeRemote(
  driveId: string,
  channelConfig: { type: string; parameters: Record<string, unknown> },
): Remote {
  return {
    meta: {
      id: `remote-${driveId}`,
      name: `remote-${driveId}`,
      collectionId: DriveCollectionId.forDrive(driveId),
      channelConfig,
      filter: { documentId: [], scope: [], branch: "main" },
      options: {},
    },
    channel: {},
  } as unknown as Remote;
}

function makeFakeSyncManager(remotes: Remote[]): ISyncManager {
  return { list: () => remotes } as unknown as ISyncManager;
}

describe("resolveDriveSwitchboard", () => {
  it("derives the switchboard base and GraphQL endpoint from a gql channel url", () => {
    const manager = makeFakeSyncManager([
      makeRemote("drive-1", {
        type: "gql",
        parameters: { url: "http://localhost:4001/graphql/r" },
      }),
    ]);
    expect(resolveDriveSwitchboard("drive-1", manager)).toEqual({
      switchboardUrl: "http://localhost:4001",
      graphqlUrl: "http://localhost:4001/graphql",
    });
  });

  it("keeps a subpath deployment prefix intact", () => {
    const manager = makeFakeSyncManager([
      makeRemote("drive-1", {
        type: "gql",
        parameters: {
          url: "https://example.com/api/reactor/graphql/r",
        },
      }),
    ]);
    expect(resolveDriveSwitchboard("drive-1", manager)).toEqual({
      switchboardUrl: "https://example.com/api/reactor",
      graphqlUrl: "https://example.com/api/reactor/graphql",
    });
  });

  it("returns undefined for a drive id with no matching remote", () => {
    const manager = makeFakeSyncManager([
      makeRemote("drive-1", {
        type: "gql",
        parameters: { url: "http://localhost:4001/graphql/r" },
      }),
    ]);
    expect(resolveDriveSwitchboard("drive-2", manager)).toBeUndefined();
  });

  it("returns undefined for a remote that is not a gql channel", () => {
    const manager = makeFakeSyncManager([
      makeRemote("drive-1", {
        type: "internal",
        parameters: {},
      }),
    ]);
    expect(resolveDriveSwitchboard("drive-1", manager)).toBeUndefined();
  });

  it("returns undefined when the channel url is missing or not a graphql channel endpoint", () => {
    const noUrl = makeFakeSyncManager([
      makeRemote("drive-1", { type: "gql", parameters: {} }),
    ]);
    const badSuffix = makeFakeSyncManager([
      makeRemote("drive-1", {
        type: "gql",
        parameters: { url: "http://localhost:4001/graphql" },
      }),
    ]);
    expect(resolveDriveSwitchboard("drive-1", noUrl)).toBeUndefined();
    expect(resolveDriveSwitchboard("drive-1", badSuffix)).toBeUndefined();
  });

  it("returns undefined without a drive id or sync manager", () => {
    const manager = makeFakeSyncManager([
      makeRemote("drive-1", {
        type: "gql",
        parameters: { url: "http://localhost:4001/graphql/r" },
      }),
    ]);
    expect(resolveDriveSwitchboard(undefined, manager)).toBeUndefined();
    expect(resolveDriveSwitchboard("drive-1", undefined)).toBeUndefined();
  });
});

describe("summarizeIntrospectionSchema", () => {
  // [DocumentSearchInput!]! = NON_NULL(LIST(NON_NULL(NAMED)))
  const filtersArgType = {
    kind: "NON_NULL",
    name: null,
    ofType: {
      kind: "LIST",
      name: null,
      ofType: {
        kind: "NON_NULL",
        name: null,
        ofType: { kind: "NAMED", name: "DocumentSearchInput", ofType: null },
      },
    },
  };

  const fixture = {
    queryType: {
      fields: [
        {
          name: "findDocuments",
          description: "Search documents in the reactor.",
          args: [
            {
              name: "search",
              type: {
                kind: "NON_NULL",
                name: null,
                ofType: {
                  kind: "NAMED",
                  name: "DocumentSearchInput",
                  ofType: null,
                },
              },
            },
            { name: "filters", type: filtersArgType },
          ],
          type: { kind: "NAMED", name: "FindDocumentsResult", ofType: null },
        },
        {
          name: "document",
          description: null,
          args: [],
          type: {
            kind: "LIST",
            name: null,
            ofType: { kind: "NAMED", name: "Document", ofType: null },
          },
        },
      ],
    },
    mutationType: {
      fields: [
        {
          name: "deleteDocument",
          description: null,
          args: [
            {
              name: "id",
              type: {
                kind: "NON_NULL",
                name: null,
                ofType: { kind: "NAMED", name: "DocumentId", ofType: null },
              },
            },
          ],
          type: {
            kind: "NON_NULL",
            name: null,
            ofType: { kind: "NAMED", name: "Boolean", ofType: null },
          },
        },
      ],
    },
  };

  it("omits description when it is absent and tolerates a missing mutation root", () => {
    const summary = summarizeIntrospectionSchema({
      queryType: fixture.queryType,
    });
    expect(summary.queries[1]).toEqual({
      name: "document",
      args: "",
      returns: "[Document]",
    });
    expect("description" in summary.queries[1]).toBe(false);
    expect(summary.mutations).toEqual([]);
    expect(summary.truncated).toBe(false);
  });

  it("renders field signatures, arg types and return types", () => {
    expect(summarizeIntrospectionSchema(fixture)).toEqual({
      queries: [
        {
          name: "findDocuments",
          description: "Search documents in the reactor.",
          args: "search: DocumentSearchInput!, filters: [DocumentSearchInput!]!",
          returns: "FindDocumentsResult",
        },
        {
          name: "document",
          args: "",
          returns: "[Document]",
        },
      ],
      mutations: [
        {
          name: "deleteDocument",
          args: "id: DocumentId!",
          returns: "Boolean!",
        },
      ],
      truncated: false,
    });
  });

  it("truncates roots that exceed the field cap", () => {
    const manyFields = {
      queryType: {
        fields: Array.from({ length: 201 }, (_, i) => ({
          name: `q${i}`,
          description: null,
          args: [],
          type: { kind: "NAMED", name: "String", ofType: null },
        })),
      },
      mutationType: { fields: [] },
    };
    const summary = summarizeIntrospectionSchema(manyFields);
    expect(summary.truncated).toBe(true);
    expect(summary.queries).toHaveLength(200);
  });

  it("summarizes an empty payload as empty roots", () => {
    expect(summarizeIntrospectionSchema(undefined)).toEqual({
      queries: [],
      mutations: [],
      truncated: false,
    });
  });
});

describe("createSwitchboardSchemaTool", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    vi.restoreAllMocks();
  });

  const gqlRemote = makeRemote("drive-1", {
    type: "gql",
    parameters: { url: "http://localhost:4001/graphql/r" },
  });

  const introspectionBody = {
    data: {
      __schema: {
        queryType: {
          fields: [
            {
              name: "findDocuments",
              description: null,
              args: [
                {
                  name: "search",
                  type: {
                    kind: "NON_NULL",
                    name: null,
                    ofType: {
                      kind: "NAMED",
                      name: "DocumentSearchInput",
                      ofType: null,
                    },
                  },
                },
              ],
              type: {
                kind: "NAMED",
                name: "FindDocumentsResult",
                ofType: null,
              },
            },
          ],
        },
        mutationType: { fields: [] },
      },
    },
  };

  type FetchLike = (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;

  function makeFetch(
    status: number,
    body: unknown,
    statusText = "",
  ): Mock<FetchLike> {
    return vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          statusText,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }

  function makeTool(
    fetchImpl: Mock<FetchLike>,
    overrides: {
      token?: string | undefined;
      remotes?: Remote[];
    } = {},
    selectedDriveId: string | null = "drive-1",
  ) {
    const { token, remotes = [gqlRemote] } = overrides;
    return createSwitchboardSchemaTool({
      getSyncManager: () => makeFakeSyncManager(remotes),
      getSelectedDriveId: () => selectedDriveId ?? undefined,
      tokenProvider: () => Promise.resolve(token),
      fetchImpl,
      timeoutMs: 1_000,
    });
  }

  it("has the expected read-only descriptor shape", () => {
    const tool = makeTool(makeFetch(200, introspectionBody));
    expect(tool.name).toBe(SWITCHBOARD_SCHEMA_TOOL_NAME);
    expect(tool.annotations).toEqual({ readOnlyHint: true });
    expect(tool.inputSchema).toHaveProperty("driveId");
    expect(tool.description).toContain("Read-only");
  });

  it("posts the introspection query to the resolved graphql endpoint with the bearer token", async () => {
    const fetchImpl = makeFetch(200, introspectionBody);
    const tool = makeTool(fetchImpl, { token: "test-token" });
    const result = (await tool.callback(undefined as never)) as Record<
      string,
      unknown
    >;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:4001/graphql");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      query: SWITCHBOARD_INTROSPECTION_QUERY,
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["authorization"]).toBe("Bearer test-token");

    expect(result).toEqual({
      switchboardUrl: "http://localhost:4001",
      graphqlUrl: "http://localhost:4001/graphql",
      queries: [
        {
          name: "findDocuments",
          args: "search: DocumentSearchInput!",
          returns: "FindDocumentsResult",
        },
      ],
      mutations: [],
      truncated: false,
    });
  });

  it("omits the authorization header when no token is available", async () => {
    const fetchImpl = makeFetch(200, introspectionBody);
    const tool = makeTool(fetchImpl, { token: undefined });
    await tool.callback(undefined as never);
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers["authorization"]).toBeUndefined();
  });

  it("rejects with the sign-in error on HTTP 401", async () => {
    const tool = makeTool(makeFetch(401, { errors: [] }));
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      "Switchboard at http://localhost:4001/graphql refused the request (HTTP 401). Sign in to the switchboard (Renown) and try again.",
    );
  });

  it("rejects with an error for other non-2xx responses", async () => {
    const tool = makeTool(makeFetch(500, {}, "Internal Server Error"));
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      "Switchboard introspection failed: HTTP 500 Internal Server Error from http://localhost:4001/graphql",
    );
  });

  it("rejects with a reachability error when fetch fails", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("fetch failed")));
    const tool = createSwitchboardSchemaTool({
      getSyncManager: () => makeFakeSyncManager([gqlRemote]),
      getSelectedDriveId: () => "drive-1",
      tokenProvider: () => Promise.resolve(undefined),
      fetchImpl,
    });
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      "Switchboard at http://localhost:4001/graphql is not reachable: fetch failed",
    );
  });

  it("rejects when the drive has no switchboard", async () => {
    const tool = makeTool(
      makeFetch(200, introspectionBody),
      {
        remotes: [],
      },
      "drive-local",
    );
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      'Drive "drive-local" has no switchboard: it is not synced to a remote switchboard.',
    );
  });

  it("rejects when no drive is selected and none is given", async () => {
    const tool = makeTool(
      makeFetch(200, introspectionBody),
      { remotes: [gqlRemote] },
      null,
    );
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      "No drive is currently selected and no driveId was given.",
    );
  });

  it("uses the driveId argument over the selected drive", async () => {
    const fetchImpl = makeFetch(200, introspectionBody);
    const tool = makeTool(
      fetchImpl,
      {
        remotes: [
          gqlRemote,
          makeRemote("drive-2", {
            type: "gql",
            parameters: { url: "http://localhost:4002/graphql/r" },
          }),
        ],
      },
      "drive-1",
    );
    await tool.callback({ driveId: "drive-2" } as never);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:4002/graphql");
  });

  it("throws the GraphQL errors when the response carries them", async () => {
    const tool = makeTool(
      makeFetch(200, {
        errors: [{ message: "Introspection is disabled." }],
        data: null,
      }),
    );
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      "Introspection is disabled.",
    );
  });

  it("rejects when the response has no GraphQL schema", async () => {
    const tool = makeTool(makeFetch(200, { data: { __schema: null } }));
    await expect(tool.callback(undefined as never)).rejects.toThrow(
      "Switchboard at http://localhost:4001/graphql did not return a GraphQL schema.",
    );
  });

  it("defaults the drive id from window.ph.selectedDriveId", async () => {
    (globalThis as Record<string, unknown>).window = {
      ph: { selectedDriveId: "drive-1" },
    };
    const fetchImpl = makeFetch(200, introspectionBody);
    const tool = createSwitchboardSchemaTool({
      getSyncManager: () => makeFakeSyncManager([gqlRemote]),
      tokenProvider: () => Promise.resolve(undefined),
      fetchImpl,
    });
    await tool.callback(undefined as never);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:4001/graphql");
  });
});
