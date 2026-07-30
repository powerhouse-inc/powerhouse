import type { Action } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCache } from "../../src/document-cache.js";
import type { GetDocumentQuery } from "../../src/graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../../src/graphql/types.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import type { MutateDocumentWithOperationsResult } from "../../src/graphql-client/operations.js";

/**
 * The proof that the REAL DocumentCache works unchanged on top of the light
 * GraphQL client: a write through the client invalidates the cache and the next
 * read returns the updated document.
 */

type MockSdk = {
  GetDocument: ReturnType<typeof vi.fn>;
  RunDocument: ReturnType<typeof vi.fn>;
  DeleteDocument: ReturnType<typeof vi.fn>;
};

function documentPayload(revision: number, name: string): GetDocumentQuery {
  return {
    document: {
      childIds: [],
      document: {
        id: "doc-1",
        slug: "my-doc",
        name: "My Doc",
        documentType: "powerhouse/test",
        state: { global: { name }, local: {} },
        createdAtUtcIso: "2026-01-01T00:00:00.000Z",
        lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
        revisionsList: [
          { scope: "global", revision },
          { scope: "document", revision: 1 },
        ],
      },
    },
  };
}

const mutationPayload: MutateDocumentWithOperationsResult = {
  mutateDocument: {
    id: "doc-1",
    slug: "my-doc",
    name: "My Doc",
    documentType: "powerhouse/test",
    state: { global: { name: "world" }, local: {} },
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-03T00:00:00.000Z",
    revisionsList: [
      { scope: "global", revision: 8 },
      { scope: "document", revision: 1 },
    ],
    operations: {
      items: [
        {
          index: 7,
          timestampUtcMs: "1700000007000",
          hash: "hash-7",
          skip: 0,
          error: null,
          id: "op-7",
          action: {
            id: "action-1",
            type: "SET_NAME",
            timestampUtcMs: "1700000007000",
            input: { name: "world" },
            scope: "global",
            context: null,
          },
        },
      ],
    },
  },
};

const action: Action = {
  id: "action-1",
  type: "SET_NAME",
  timestampUtcMs: "1700000007000",
  input: { name: "world" },
  scope: "global",
};

/**
 * `GetDocument` is answered with the pre-write document until `bumpDocument` is
 * called, so the cache's forced refetch is what surfaces the new state.
 */
function createMockSdk(): MockSdk {
  return {
    GetDocument: vi.fn().mockResolvedValue(documentPayload(7, "hello")),
    RunDocument: vi.fn().mockResolvedValue(mutationPayload),
    DeleteDocument: vi.fn().mockResolvedValue({ deleteDocument: true }),
  };
}

function bumpDocument(sdk: MockSdk): void {
  sdk.GetDocument.mockResolvedValue(documentPayload(8, "world"));
}

function createClientWith(sdk: MockSdk): GraphQLReactorClient {
  return new GraphQLReactorClient({
    url: "http://localhost:4001/graphql",
    graphqlClient: sdk as unknown as ReactorGraphQLClient,
    // These cases are about the local emitter; the realtime socket has its own
    // suite in subscriptions.test.ts.
    realtime: false,
  });
}

beforeEach(() => {
  window.ph = {};
});

afterEach(() => {
  window.ph = {};
  vi.restoreAllMocks();
});

describe("DocumentCache over GraphQLReactorClient", () => {
  it("serves a document from the client and caches it", async () => {
    const sdk = createMockSdk();
    const cache = new DocumentCache(createClientWith(sdk));

    const first = await cache.get("doc-1");
    const second = await cache.get("doc-1");

    expect(first.header.id).toBe("doc-1");
    expect(first.state).toEqual({ global: { name: "hello" }, local: {} });
    expect(second).toBe(first);
    expect(sdk.GetDocument).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it("refetches and notifies its listeners after an execute", async () => {
    const sdk = createMockSdk();
    const client = createClientWith(sdk);
    const cache = new DocumentCache(client);

    await cache.get("doc-1");
    const listener = vi.fn();
    cache.subscribe("doc-1", listener);

    // The mutation moves the document to revision 8; a later read sees it.
    sdk.RunDocument.mockImplementation(() => {
      bumpDocument(sdk);
      return Promise.resolve(mutationPayload);
    });

    const result = await client.execute("doc-1", "main", [action]);
    expect(result.header.revision.global).toBe(8);

    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    const updated = await cache.get("doc-1");
    expect(updated.state).toEqual({ global: { name: "world" }, local: {} });
    expect(updated.header.revision.global).toBe(8);

    // 1 initial read, 1 execute pre-fetch, 1 forced refetch.
    expect(sdk.GetDocument).toHaveBeenCalledTimes(3);

    cache.dispose();
  });

  it("evicts the document and notifies its listeners after a delete", async () => {
    const sdk = createMockSdk();
    const client = createClientWith(sdk);
    const cache = new DocumentCache(client);

    await cache.get("doc-1");
    const listener = vi.fn();
    cache.subscribe("doc-1", listener);

    await client.deleteDocument("doc-1");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(sdk.GetDocument).toHaveBeenCalledTimes(1);

    await cache.get("doc-1");
    expect(sdk.GetDocument).toHaveBeenCalledTimes(2);

    cache.dispose();
  });

  it("leaves untouched documents alone when another one is deleted", async () => {
    const sdk = createMockSdk();
    const client = createClientWith(sdk);
    const cache = new DocumentCache(client);

    await cache.get("doc-1");
    const listener = vi.fn();
    cache.subscribe("doc-1", listener);

    await client.deleteDocument("doc-2");

    expect(listener).not.toHaveBeenCalled();
    await cache.get("doc-1");
    expect(sdk.GetDocument).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it("stops reacting once disposed", async () => {
    const sdk = createMockSdk();
    const client = createClientWith(sdk);
    const cache = new DocumentCache(client);

    await cache.get("doc-1");
    const listener = vi.fn();
    cache.subscribe("doc-1", listener);
    cache.dispose();

    await client.deleteDocument("doc-1");

    expect(listener).not.toHaveBeenCalled();
  });
});
