import { describe, expect, it, vi } from "vitest";
import type {
  GetDocumentOperationsQuery,
  GetDocumentQuery,
} from "../../src/graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../../src/graphql/types.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";

type OperationsPage = GetDocumentOperationsQuery["documentOperations"];

type MockSdk = {
  GetDocument: ReturnType<typeof vi.fn>;
  GetDocumentOperations: ReturnType<typeof vi.fn>;
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
  totalCount: 0,
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

    await expect(
      createClientWith(sdk).get("doc-1", { revision: 3 }),
    ).rejects.toThrow("point-in-time views are not supported");
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
    totalCount: 5,
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

    expect(results.totalCount).toBe(5);
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
