import { describe, expect, it, vi } from "vitest";
import type {
  FindDocumentsQuery,
  GetDocumentIncomingRelationshipEdgesQuery,
  GetDocumentOperationsQuery,
  GetDocumentOutgoingRelationshipsQuery,
  GetDocumentQuery,
} from "../../src/graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../../src/graphql/types.js";
import { GraphQLOperationNotSupportedError } from "../../src/graphql-client/errors.js";
import {
  findIsServableOverGraphQL,
  GraphQLReactorClient,
} from "../../src/graphql-client/graphql-reactor-client.js";

type OperationsPage = GetDocumentOperationsQuery["documentOperations"];
type FindPage = FindDocumentsQuery["findDocuments"];
type RelationshipsPage =
  GetDocumentOutgoingRelationshipsQuery["documentOutgoingRelationships"];
type EdgesPage =
  GetDocumentIncomingRelationshipEdgesQuery["documentIncomingRelationshipEdges"];

type MockSdk = {
  GetDocument: ReturnType<typeof vi.fn>;
  GetDocumentOperations: ReturnType<typeof vi.fn>;
  FindDocuments: ReturnType<typeof vi.fn>;
  GetDocumentOutgoingRelationships: ReturnType<typeof vi.fn>;
  GetDocumentIncomingRelationships: ReturnType<typeof vi.fn>;
  GetDocumentOutgoingRelationshipEdges: ReturnType<typeof vi.fn>;
  GetDocumentIncomingRelationshipEdges: ReturnType<typeof vi.fn>;
};

const documentFields = {
  id: "doc-1",
  slug: "my-doc",
  name: "My Doc",
  documentType: "powerhouse/document-drive",
  state: { global: { name: "hello" }, local: {} },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  revisionsList: [
    { scope: "global", revision: 7 },
    { scope: "document", revision: 1 },
  ],
};

const emptyFindPage: FindPage = {
  items: [],
  hasNextPage: false,
  hasPreviousPage: false,
  cursor: null,
};

const documentPayload: GetDocumentQuery = {
  document: {
    childIds: ["child-1"],
    document: {
      id: "doc-1",
      slug: "my-doc",
      name: "My Doc",
      documentType: "powerhouse/test",
      state: { global: { name: "hello" }, local: {} },
      createdAtUtcIso: "2026-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
      revisionsList: [
        { scope: "global", revision: 7 },
        { scope: "document", revision: 1 },
      ],
    },
  },
};

const emptyOperationsPage: OperationsPage = {
  items: [],
  hasNextPage: false,
  hasPreviousPage: false,
  cursor: null,
};

function createMockSdk(overrides: Partial<MockSdk> = {}): MockSdk {
  return {
    GetDocument: vi.fn().mockResolvedValue(documentPayload),
    GetDocumentOperations: vi
      .fn()
      .mockResolvedValue({ documentOperations: emptyOperationsPage }),
    FindDocuments: vi.fn().mockResolvedValue({ findDocuments: emptyFindPage }),
    GetDocumentOutgoingRelationships: vi
      .fn()
      .mockResolvedValue({ documentOutgoingRelationships: emptyFindPage }),
    GetDocumentIncomingRelationships: vi
      .fn()
      .mockResolvedValue({ documentIncomingRelationships: emptyFindPage }),
    GetDocumentOutgoingRelationshipEdges: vi.fn().mockResolvedValue({
      documentOutgoingRelationshipEdges: emptyFindPage,
    }),
    GetDocumentIncomingRelationshipEdges: vi.fn().mockResolvedValue({
      documentIncomingRelationshipEdges: emptyFindPage,
    }),
    ...overrides,
  };
}

function createClientWith(sdk: MockSdk): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
  });
}

describe("GraphQLReactorClient.get", () => {
  it("maps a GetDocument result onto a PHDocument", async () => {
    const sdk = createMockSdk();
    const document = await createClientWith(sdk).get("doc-1");

    expect(document.header.id).toBe("doc-1");
    expect(document.header.slug).toBe("my-doc");
    expect(document.header.name).toBe("My Doc");
    expect(document.header.documentType).toBe("powerhouse/test");
    expect(document.header.branch).toBe("main");
    expect(document.header.createdAtUtcIso).toBe("2026-01-01T00:00:00.000Z");
    expect(document.header.lastModifiedAtUtcIso).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(document.state).toEqual({ global: { name: "hello" }, local: {} });
    expect(document.initialState).toEqual(document.state);
    expect(document.clipboard).toEqual([]);
  });

  it("preserves the per-scope revision map", async () => {
    const sdk = createMockSdk();
    const document = await createClientWith(sdk).get("doc-1");

    expect(document.header.revision).toEqual({ global: 7, document: 1 });
  });

  it("fills sig with the empty presigned shape", async () => {
    const sdk = createMockSdk();
    const document = await createClientWith(sdk).get("doc-1");

    expect(document.header.sig).toEqual({ publicKey: {}, nonce: "" });
  });

  it("returns an empty operation list per known scope", async () => {
    const sdk = createMockSdk();
    const document = await createClientWith(sdk).get("doc-1");

    expect(document.operations).toEqual({ global: [], document: [] });
  });

  it("passes a slug identifier through verbatim", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).get("my-doc");

    expect(sdk.GetDocument).toHaveBeenCalledWith(
      { identifier: "my-doc", view: undefined },
      undefined,
      undefined,
    );
  });

  it("maps branch and scopes into the view input", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).get("doc-1", {
      branch: "draft",
      scopes: ["global"],
    });

    expect(sdk.GetDocument).toHaveBeenCalledWith(
      { identifier: "doc-1", view: { branch: "draft", scopes: ["global"] } },
      undefined,
      undefined,
    );
  });

  it("reports the branch it was read from on the header", async () => {
    const sdk = createMockSdk();
    const document = await createClientWith(sdk).get("doc-1", {
      branch: "feature-x",
    });

    expect(document.header.branch).toBe("feature-x");
  });

  it("forwards the abort signal to the sdk", async () => {
    const sdk = createMockSdk();
    const controller = new AbortController();
    await createClientWith(sdk).get("doc-1", undefined, controller.signal);

    expect(sdk.GetDocument).toHaveBeenCalledWith(
      { identifier: "doc-1", view: undefined },
      undefined,
      controller.signal,
    );
  });

  it("rejects point-in-time views", async () => {
    const sdk = createMockSdk();

    const read = createClientWith(sdk).get("doc-1", { revision: 3 });

    await expect(read).rejects.toThrow("point-in-time views are not supported");
    await expect(read).rejects.toSatisfy((error) =>
      GraphQLOperationNotSupportedError.isError(error),
    );
    expect(sdk.GetDocument).not.toHaveBeenCalled();
  });

  it("rejects when the document is not found", async () => {
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockResolvedValue({ document: null }),
    });

    await expect(createClientWith(sdk).get("missing")).rejects.toThrow(
      "Document not found: missing",
    );
  });

  it("propagates GraphQL transport errors", async () => {
    const sdk = createMockSdk({
      GetDocument: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(createClientWith(sdk).get("doc-1")).rejects.toThrow("boom");
  });
});

describe("GraphQLReactorClient.getOperations", () => {
  const operationsPage: OperationsPage = {
    items: [
      {
        index: 0,
        timestampUtcMs: "1700000000000",
        hash: "hash-0",
        skip: 0,
        error: null,
        id: "op-0",
        action: {
          id: "action-0",
          type: "SET_NAME",
          timestampUtcMs: "1700000000000",
          input: { name: "hello" },
          scope: "global",
          context: {
            signer: {
              signatures: ["a, b, c, d, e"],
              user: { address: "0x1", networkId: "eip155", chainId: 1 },
              app: { name: "app", key: "key" },
            },
          },
        },
      },
      {
        index: 1,
        timestampUtcMs: "1700000001000",
        hash: "hash-1",
        skip: 0,
        error: null,
        id: null,
        action: {
          id: "action-1",
          type: "SET_NAME",
          timestampUtcMs: "1700000001000",
          input: { name: "world" },
          scope: "global",
          context: null,
        },
      },
    ],
    hasNextPage: true,
    hasPreviousPage: false,
    cursor: "cursor-2",
  };

  it("maps operation items", async () => {
    const sdk = createMockSdk({
      GetDocumentOperations: vi
        .fn()
        .mockResolvedValue({ documentOperations: operationsPage }),
    });
    const results = await createClientWith(sdk).getOperations("doc-1");

    expect(results.results).toHaveLength(2);
    expect(results.results[0]).toMatchObject({
      id: "op-0",
      index: 0,
      skip: 0,
      hash: "hash-0",
      timestampUtcMs: "1700000000000",
    });
    expect(results.results[0].action.type).toBe("SET_NAME");
    expect(results.results[0].action.context?.signer?.signatures).toEqual([
      ["a", "b", "c", "d", "e"],
    ]);
    expect(results.results[1].id).toBe("");
    expect(results.results[1].action.context).toBeUndefined();
  });

  it("maps paging metadata", async () => {
    const sdk = createMockSdk({
      GetDocumentOperations: vi
        .fn()
        .mockResolvedValue({ documentOperations: operationsPage }),
    });
    const results = await createClientWith(sdk).getOperations(
      "doc-1",
      undefined,
      undefined,
      { cursor: "cursor-1", limit: 2 },
    );

    expect(results.nextCursor).toBe("cursor-2");
    expect(results.options).toEqual({ cursor: "cursor-1", limit: 2 });
    expect(sdk.GetDocumentOperations).toHaveBeenCalledWith(
      {
        filter: {
          documentId: "doc-1",
          branch: undefined,
          scopes: undefined,
          actionTypes: undefined,
          timestampFrom: undefined,
          timestampTo: undefined,
          sinceRevision: undefined,
        },
        paging: { cursor: "cursor-1", limit: 2 },
      },
      undefined,
      undefined,
    );
  });

  it("omits next and nextCursor on the last page", async () => {
    const sdk = createMockSdk();
    const results = await createClientWith(sdk).getOperations("doc-1");

    expect(results.results).toEqual([]);
    expect(results.nextCursor).toBeUndefined();
    expect(results.next).toBeUndefined();
    expect(results.options).toEqual({ cursor: "0", limit: 100 });
  });

  it("follows the next page with the returned cursor", async () => {
    const getDocumentOperations = vi
      .fn()
      .mockResolvedValueOnce({ documentOperations: operationsPage })
      .mockResolvedValueOnce({ documentOperations: emptyOperationsPage });
    const sdk = createMockSdk({
      GetDocumentOperations: getDocumentOperations,
    });

    const first = await createClientWith(sdk).getOperations(
      "doc-1",
      undefined,
      undefined,
      { cursor: "cursor-1", limit: 2 },
    );
    const second = await first.next?.();

    expect(second?.results).toEqual([]);
    const secondCallVariables = getDocumentOperations.mock.calls[1]?.[0] as {
      paging?: { cursor: string; limit: number };
    };
    expect(secondCallVariables.paging).toEqual({
      cursor: "cursor-2",
      limit: 2,
    });
  });

  it("maps the view and operation filters into the operations filter", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).getOperations(
      "doc-1",
      { branch: "draft", scopes: ["global"] },
      {
        actionTypes: ["SET_NAME"],
        timestampFrom: "2026-01-01T00:00:00.000Z",
        timestampTo: "2026-02-01T00:00:00.000Z",
        sinceRevision: 3,
      },
    );

    expect(sdk.GetDocumentOperations).toHaveBeenCalledWith(
      {
        filter: {
          documentId: "doc-1",
          branch: "draft",
          scopes: ["global"],
          actionTypes: ["SET_NAME"],
          timestampFrom: "2026-01-01T00:00:00.000Z",
          timestampTo: "2026-02-01T00:00:00.000Z",
          sinceRevision: 3,
        },
        paging: undefined,
      },
      undefined,
      undefined,
    );
  });

  it("rejects point-in-time views", async () => {
    const sdk = createMockSdk();

    await expect(
      createClientWith(sdk).getOperations("doc-1", { revision: 3 }),
    ).rejects.toThrow("point-in-time views are not supported");
    expect(sdk.GetDocumentOperations).not.toHaveBeenCalled();
  });
});

describe("GraphQLReactorClient.find", () => {
  const findPage: FindPage = {
    items: [documentFields, { ...documentFields, id: "doc-2", slug: "doc-2" }],
    hasNextPage: true,
    hasPreviousPage: false,
    cursor: "cursor-2",
  };

  it("maps the found documents onto PHDocuments", async () => {
    const sdk = createMockSdk({
      FindDocuments: vi.fn().mockResolvedValue({ findDocuments: findPage }),
    });
    const results = await createClientWith(sdk).find({
      type: "powerhouse/document-drive",
    });

    expect(results.results).toHaveLength(2);
    expect(results.results[0].header.id).toBe("doc-1");
    expect(results.results[0].header.documentType).toBe(
      "powerhouse/document-drive",
    );
    expect(results.results[1].header.id).toBe("doc-2");
    expect(results.results[0].header.revision).toEqual({
      global: 7,
      document: 1,
    });
  });

  it("passes type, parentId, view and paging into the query", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).find(
      { type: "powerhouse/document-drive", parentId: "drive-1" },
      { branch: "draft", scopes: ["global"] },
      { cursor: "cursor-1", limit: 25 },
    );

    expect(sdk.FindDocuments).toHaveBeenCalledWith(
      {
        search: { type: "powerhouse/document-drive", parentId: "drive-1" },
        view: { branch: "draft", scopes: ["global"] },
        paging: { cursor: "cursor-1", limit: 25 },
      },
      undefined,
      undefined,
    );
  });

  it("maps paging metadata and follows the next page", async () => {
    const findDocuments = vi
      .fn()
      .mockResolvedValueOnce({ findDocuments: findPage })
      .mockResolvedValueOnce({ findDocuments: emptyFindPage });
    const sdk = createMockSdk({ FindDocuments: findDocuments });

    const first = await createClientWith(sdk).find(
      { type: "powerhouse/document-drive" },
      undefined,
      { cursor: "cursor-1", limit: 2 },
    );

    expect(first.nextCursor).toBe("cursor-2");
    expect(first.options).toEqual({ cursor: "cursor-1", limit: 2 });

    const second = await first.next?.();
    expect(second?.results).toEqual([]);
    const secondVariables = findDocuments.mock.calls[1]?.[0] as {
      paging?: { cursor: string; limit: number };
    };
    expect(secondVariables.paging).toEqual({ cursor: "cursor-2", limit: 2 });
  });

  it("omits next and nextCursor on the last page", async () => {
    const sdk = createMockSdk();
    const results = await createClientWith(sdk).find({ type: "x" });

    expect(results.results).toEqual([]);
    expect(results.nextCursor).toBeUndefined();
    expect(results.next).toBeUndefined();
    expect(results.options).toEqual({ cursor: "0", limit: 100 });
  });

  it("refuses a search naming ids, which the query cannot honour", async () => {
    const sdk = createMockSdk();

    const found = createClientWith(sdk).find({ ids: ["doc-1"] });

    await expect(found).rejects.toThrow(/cannot filter by ids or slugs/);
    await expect(found).rejects.toBeInstanceOf(
      GraphQLOperationNotSupportedError,
    );
    expect(sdk.FindDocuments).not.toHaveBeenCalled();
  });

  it("refuses a search naming slugs", async () => {
    const sdk = createMockSdk();

    await expect(
      createClientWith(sdk).find({ slugs: ["my-doc"] }),
    ).rejects.toThrow(/cannot filter by ids or slugs/);
    expect(sdk.FindDocuments).not.toHaveBeenCalled();
  });

  it("refuses a present-but-empty ids array rather than serving it as an all-documents query", async () => {
    const sdk = createMockSdk();

    await expect(createClientWith(sdk).find({ ids: [] })).rejects.toThrow(
      /cannot filter by ids or slugs/,
    );
    expect(sdk.FindDocuments).not.toHaveBeenCalled();
  });

  it("refuses a present-but-empty slugs array", async () => {
    const sdk = createMockSdk();

    await expect(createClientWith(sdk).find({ slugs: [] })).rejects.toThrow(
      /cannot filter by ids or slugs/,
    );
    expect(sdk.FindDocuments).not.toHaveBeenCalled();
  });

  it("refuses a mixed type-and-empty-ids search", async () => {
    const sdk = createMockSdk();

    await expect(
      createClientWith(sdk).find({ type: "x", ids: [] }),
    ).rejects.toThrow(/cannot filter by ids or slugs/);
    expect(sdk.FindDocuments).not.toHaveBeenCalled();
  });

  it("sends the same effective limit on page 1 and the next() continuation", async () => {
    const findDocuments = vi
      .fn()
      .mockResolvedValueOnce({ findDocuments: findPage })
      .mockResolvedValueOnce({ findDocuments: emptyFindPage });
    const sdk = createMockSdk({ FindDocuments: findDocuments });

    const first = await createClientWith(sdk).find({ type: "x" });
    await first.next?.();

    const firstVariables = findDocuments.mock.calls[0]?.[0] as {
      paging?: { cursor: string; limit: number };
    };
    const secondVariables = findDocuments.mock.calls[1]?.[0] as {
      paging?: { cursor: string; limit: number };
    };

    expect(firstVariables.paging).toEqual({ cursor: "0", limit: 100 });
    expect(first.options).toEqual({ cursor: "0", limit: 100 });
    expect(secondVariables.paging).toEqual({ cursor: "cursor-2", limit: 100 });
  });

  it("rejects point-in-time views", async () => {
    const sdk = createMockSdk();

    await expect(
      createClientWith(sdk).find({ type: "x" }, { revision: 3 }),
    ).rejects.toThrow("point-in-time views are not supported");
    expect(sdk.FindDocuments).not.toHaveBeenCalled();
  });

  it("propagates GraphQL transport errors", async () => {
    const sdk = createMockSdk({
      FindDocuments: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(createClientWith(sdk).find({ type: "x" })).rejects.toThrow(
      "boom",
    );
  });
});

describe("GraphQLReactorClient relationship reads", () => {
  const relationshipsPage: RelationshipsPage = {
    items: [documentFields],
    hasNextPage: false,
    hasPreviousPage: false,
    cursor: null,
  };

  const edgesPage: EdgesPage = {
    items: [
      {
        sourceId: "doc-1",
        targetId: "doc-2",
        relationshipType: "cites",
        metadata: { note: "see appendix" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        sourceId: "doc-1",
        targetId: "doc-3",
        relationshipType: "cites",
        metadata: null,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    hasNextPage: false,
    hasPreviousPage: false,
    cursor: null,
  };

  it("maps outgoing relationship documents and passes the type", async () => {
    const sdk = createMockSdk({
      GetDocumentOutgoingRelationships: vi.fn().mockResolvedValue({
        documentOutgoingRelationships: relationshipsPage,
      }),
    });
    const results = await createClientWith(sdk).getOutgoingRelationships(
      "doc-1",
      "cites",
    );

    expect(results.results).toHaveLength(1);
    expect(results.results[0].header.id).toBe("doc-1");
    expect(sdk.GetDocumentOutgoingRelationships).toHaveBeenCalledWith(
      {
        sourceIdentifier: "doc-1",
        relationshipType: "cites",
        view: undefined,
        paging: undefined,
      },
      undefined,
      undefined,
    );
  });

  it("maps incoming relationship edges, restoring dates and dropping null metadata", async () => {
    const sdk = createMockSdk({
      GetDocumentIncomingRelationshipEdges: vi
        .fn()
        .mockResolvedValue({ documentIncomingRelationshipEdges: edgesPage }),
    });
    const results =
      await createClientWith(sdk).getIncomingRelationshipEdges("doc-2");

    expect(results.results).toHaveLength(2);
    expect(results.results[0]).toMatchObject({
      sourceId: "doc-1",
      targetId: "doc-2",
      relationshipType: "cites",
      metadata: { note: "see appendix" },
    });
    expect(results.results[0].createdAt).toBeInstanceOf(Date);
    expect(results.results[0].createdAt.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(results.results[1].metadata).toBeUndefined();
  });

  it("throws on a null DateTime rather than coercing it to the epoch", async () => {
    const badPage: EdgesPage = {
      items: [
        {
          sourceId: "doc-1",
          targetId: "doc-2",
          relationshipType: "cites",
          metadata: null,
          createdAt: null as unknown as string,
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      hasNextPage: false,
      hasPreviousPage: false,
      cursor: null,
    };
    const sdk = createMockSdk({
      GetDocumentIncomingRelationshipEdges: vi
        .fn()
        .mockResolvedValue({ documentIncomingRelationshipEdges: badPage }),
    });

    await expect(
      createClientWith(sdk).getIncomingRelationshipEdges("doc-2"),
    ).rejects.toThrow(/missing a required DateTime/);
  });

  it("throws on an unparseable DateTime rather than yielding an Invalid Date", async () => {
    const badPage: EdgesPage = {
      items: [
        {
          sourceId: "doc-1",
          targetId: "doc-2",
          relationshipType: "cites",
          metadata: null,
          createdAt: "not-a-date",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      hasNextPage: false,
      hasPreviousPage: false,
      cursor: null,
    };
    const sdk = createMockSdk({
      GetDocumentIncomingRelationshipEdges: vi
        .fn()
        .mockResolvedValue({ documentIncomingRelationshipEdges: badPage }),
    });

    await expect(
      createClientWith(sdk).getIncomingRelationshipEdges("doc-2"),
    ).rejects.toThrow(/unparseable DateTime/);
  });

  it("drops a non-object metadata scalar rather than casting it to an object", async () => {
    const scalarMetaPage: EdgesPage = {
      items: [
        {
          sourceId: "doc-1",
          targetId: "doc-2",
          relationshipType: "cites",
          metadata: "a plain string" as unknown as Record<string, unknown>,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
        {
          sourceId: "doc-1",
          targetId: "doc-3",
          relationshipType: "cites",
          metadata: [1, 2, 3] as unknown as Record<string, unknown>,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      hasNextPage: false,
      hasPreviousPage: false,
      cursor: null,
    };
    const sdk = createMockSdk({
      GetDocumentIncomingRelationshipEdges: vi.fn().mockResolvedValue({
        documentIncomingRelationshipEdges: scalarMetaPage,
      }),
    });
    const results =
      await createClientWith(sdk).getIncomingRelationshipEdges("doc-2");

    expect(results.results[0].metadata).toBeUndefined();
    expect(results.results[1].metadata).toBeUndefined();
  });

  it("forwards an optional relationship type on the edges query", async () => {
    const sdk = createMockSdk();
    await createClientWith(sdk).getOutgoingRelationshipEdges("doc-1");

    expect(sdk.GetDocumentOutgoingRelationshipEdges).toHaveBeenCalledWith(
      {
        sourceIdentifier: "doc-1",
        relationshipType: undefined,
        view: undefined,
        paging: undefined,
      },
      undefined,
      undefined,
    );
  });
});

describe("findIsServableOverGraphQL (single-source servable predicate)", () => {
  it("serves a type/parentId search at head", () => {
    expect(findIsServableOverGraphQL({ type: "x", parentId: "p" })).toBe(true);
    expect(findIsServableOverGraphQL({ type: "x" }, { branch: "draft" })).toBe(
      true,
    );
  });

  it("refuses any present ids or slugs, empty array included", () => {
    expect(findIsServableOverGraphQL({ ids: ["a"] })).toBe(false);
    expect(findIsServableOverGraphQL({ ids: [] })).toBe(false);
    expect(findIsServableOverGraphQL({ slugs: ["s"] })).toBe(false);
    expect(findIsServableOverGraphQL({ slugs: [] })).toBe(false);
    expect(findIsServableOverGraphQL({ type: "x", ids: [] })).toBe(false);
  });

  it("refuses a point-in-time view", () => {
    expect(findIsServableOverGraphQL({ type: "x" }, { revision: 3 })).toBe(
      false,
    );
  });
});
