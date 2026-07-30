import {
  DocumentChangeType,
  type DocumentChangeEvent,
} from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetDocumentQuery } from "../../src/graphql/gen/schema.js";
import type { ReactorGraphQLClient } from "../../src/graphql/types.js";
import { GraphQLReactorClient } from "../../src/graphql-client/graphql-reactor-client.js";
import type { MutateDocumentWithOperationsResult } from "../../src/graphql-client/operations.js";

type MockSdk = {
  GetDocument: ReturnType<typeof vi.fn>;
  RunDocument: ReturnType<typeof vi.fn>;
  CreateDocument: ReturnType<typeof vi.fn>;
  DeleteDocument: ReturnType<typeof vi.fn>;
};

const documentPayload: GetDocumentQuery = {
  document: {
    childIds: [],
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
    operations: { items: [] },
  },
};

const action: Action = {
  id: "action-1",
  type: "SET_NAME",
  timestampUtcMs: "1700000007000",
  input: { name: "world" },
  scope: "global",
};

function createMockSdk(overrides: Partial<MockSdk> = {}): MockSdk {
  return {
    GetDocument: vi.fn().mockResolvedValue(documentPayload),
    RunDocument: vi.fn().mockResolvedValue(mutationPayload),
    CreateDocument: vi.fn().mockResolvedValue({
      createDocument: documentPayload.document!.document,
    }),
    DeleteDocument: vi.fn().mockResolvedValue({ deleteDocument: true }),
    ...overrides,
  };
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

describe("GraphQLReactorClient.subscribe", () => {
  it("emits an Updated event carrying the mutated document after execute", async () => {
    const client = createClientWith(createMockSdk());
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.execute("doc-1", "main", [action]);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(DocumentChangeType.Updated);
    expect(events[0].documents).toHaveLength(1);
    expect(events[0].documents[0].header.id).toBe("doc-1");
    expect(events[0].documents[0].header.revision.global).toBe(8);
  });

  it("emits a Created event carrying the created document", async () => {
    const client = createClientWith(createMockSdk());
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.create({ header: { id: "doc-1" } } as never);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(DocumentChangeType.Created);
    expect(events[0].documents[0].header.id).toBe("doc-1");
  });

  it("emits a Deleted event with the id on context.childId", async () => {
    const client = createClientWith(createMockSdk());
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.deleteDocument("doc-1");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(DocumentChangeType.Deleted);
    expect(events[0].documents).toEqual([]);
    expect(events[0].context?.childId).toBe("doc-1");
  });

  it("emits the resolved document id when written to by slug", async () => {
    const client = createClientWith(createMockSdk());
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.execute("my-doc", "main", [action]);

    // Subscribers work in id space, whatever identifier the caller used. A
    // DocumentCache keyed by slug is therefore never invalidated - the
    // documented restriction on subscribe.
    expect(events[0].documents[0].header.id).toBe("doc-1");
  });

  it("emits the delete identifier verbatim, id or slug", async () => {
    const client = createClientWith(createMockSdk());
    const events: DocumentChangeEvent[] = [];
    client.subscribe({}, (event) => events.push(event));

    await client.deleteDocument("my-doc");

    // deleteDocument returns a boolean, so there is nothing to resolve an id
    // from: pinned here so the realtime path does not inherit the ambiguity
    // without noticing.
    expect(events[0].context?.childId).toBe("my-doc");
  });

  it("does not emit when the write fails", async () => {
    const client = createClientWith(
      createMockSdk({
        RunDocument: vi.fn().mockRejectedValue(new Error("boom")),
        DeleteDocument: vi.fn().mockRejectedValue(new Error("forbidden")),
      }),
    );
    const callback = vi.fn();
    client.subscribe({}, callback);

    await expect(client.execute("doc-1", "main", [action])).rejects.toThrow(
      "boom",
    );
    await expect(client.deleteDocument("doc-1")).rejects.toThrow("forbidden");

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops delivering after the returned unsubscribe is called", async () => {
    const client = createClientWith(createMockSdk());
    const callback = vi.fn();
    const unsubscribe = client.subscribe({}, callback);

    await client.deleteDocument("doc-1");
    unsubscribe();
    await client.deleteDocument("doc-1");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("unsubscribing one subscriber leaves the others registered", async () => {
    const client = createClientWith(createMockSdk());
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = client.subscribe({}, first);
    client.subscribe({}, second);

    unsubscribeFirst();
    await client.deleteDocument("doc-1");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps notifying the remaining subscribers when one throws", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const client = createClientWith(createMockSdk());
    const survivor = vi.fn();
    client.subscribe({}, () => {
      throw new Error("bad subscriber");
    });
    client.subscribe({}, survivor);

    await client.deleteDocument("doc-1");

    expect(survivor).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("GraphQLReactorClient.subscribe filter matching", () => {
  it("delivers everything to an empty search filter", async () => {
    const client = createClientWith(createMockSdk());
    const callback = vi.fn();
    client.subscribe({}, callback);

    await client.execute("doc-1", "main", [action]);
    await client.deleteDocument("other-doc");

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("delivers only matching ids", async () => {
    const client = createClientWith(createMockSdk());
    const matching = vi.fn();
    const other = vi.fn();
    client.subscribe({ ids: ["doc-1"] }, matching);
    client.subscribe({ ids: ["doc-2"] }, other);

    await client.execute("doc-1", "main", [action]);

    expect(matching).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("matches Deleted events on context.childId", async () => {
    const client = createClientWith(createMockSdk());
    const matching = vi.fn();
    const other = vi.fn();
    client.subscribe({ ids: ["doc-1"] }, matching);
    client.subscribe({ ids: ["doc-2"] }, other);

    await client.deleteDocument("doc-1");

    expect(matching).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("delivers only matching slugs", async () => {
    const client = createClientWith(createMockSdk());
    const matching = vi.fn();
    const other = vi.fn();
    client.subscribe({ slugs: ["my-doc"] }, matching);
    client.subscribe({ slugs: ["someone-elses-doc"] }, other);

    await client.execute("doc-1", "main", [action]);

    expect(matching).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("delivers only matching document types", async () => {
    const client = createClientWith(createMockSdk());
    const matching = vi.fn();
    const other = vi.fn();
    client.subscribe({ type: "powerhouse/test" }, matching);
    client.subscribe({ type: "powerhouse/other" }, other);

    await client.execute("doc-1", "main", [action]);

    expect(matching).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("delivers Deleted events to type and slug filters, which cannot be checked", async () => {
    const client = createClientWith(createMockSdk());
    const byType = vi.fn();
    const bySlug = vi.fn();
    client.subscribe({ type: "powerhouse/other" }, byType);
    client.subscribe({ slugs: ["someone-elses-doc"] }, bySlug);

    await client.deleteDocument("doc-1");

    expect(byType).toHaveBeenCalledTimes(1);
    expect(bySlug).toHaveBeenCalledTimes(1);
  });

  it("treats the search filter fields as AND conditions", async () => {
    const client = createClientWith(createMockSdk());
    const both = vi.fn();
    const wrongType = vi.fn();
    client.subscribe({ ids: ["doc-1"], type: "powerhouse/test" }, both);
    client.subscribe({ ids: ["doc-1"], type: "powerhouse/other" }, wrongType);

    await client.execute("doc-1", "main", [action]);

    expect(both).toHaveBeenCalledTimes(1);
    expect(wrongType).not.toHaveBeenCalled();
  });

  it("ignores parentId, which is a drive concept", async () => {
    const client = createClientWith(createMockSdk());
    const callback = vi.fn();
    client.subscribe({ parentId: "some-drive" }, callback);

    await client.execute("doc-1", "main", [action]);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
