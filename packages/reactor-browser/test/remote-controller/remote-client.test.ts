import { describe, expect, it, vi } from "vitest";
import { RemoteClient } from "../../src/remote-controller/remote-client.js";
import type { ReactorGraphQLClient } from "../../src/remote-controller/types.js";

function createMockClient(
  overrides: Partial<ReactorGraphQLClient> = {},
): ReactorGraphQLClient {
  return {
    GetDocument: vi.fn().mockResolvedValue({ document: null }),
    GetDocumentWithOperations: vi.fn().mockResolvedValue({ document: null }),
    GetDocumentOperations: vi.fn().mockResolvedValue({
      documentOperations: {
        items: [],
        totalCount: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        cursor: null,
      },
    }),
    MutateDocument: vi.fn().mockResolvedValue({
      mutateDocument: makeDocData(),
    }),
    CreateDocument: vi.fn().mockResolvedValue({
      createDocument: makeDocData(),
    }),
    CreateEmptyDocument: vi.fn().mockResolvedValue({
      createEmptyDocument: makeDocData(),
    }),
    DeleteDocument: vi.fn().mockResolvedValue({
      deleteDocument: true,
    }),
    ...overrides,
  };
}

function makeDocData(id = "doc-1") {
  return {
    id,
    slug: "test-doc",
    name: "Test Doc",
    documentType: "test/type",
    state: { global: {}, local: {} },
    createdAtUtcIso: "2024-01-01T00:00:00Z",
    lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
    revisionsList: [{ scope: "global", revision: 1 }],
  };
}

function makeRemoteOp(index: number, scope = "global") {
  return {
    index,
    timestampUtcMs: Date.now().toString(),
    hash: `hash-${index}`,
    skip: 0,
    error: null,
    id: `op-${index}`,
    action: {
      id: `action-${index}`,
      type: "SET_NAME",
      timestampUtcMs: Date.now().toString(),
      input: { name: `name-${index}` },
      scope,
      attachments: null,
      context: null,
    },
  };
}

describe("RemoteClient", () => {
  describe("getDocument", () => {
    it("returns document when found", async () => {
      const docData = makeDocData();
      const mock = createMockClient({
        GetDocument: vi.fn().mockResolvedValue({
          document: { document: docData, childIds: ["child-1"] },
        }),
      });

      const client = new RemoteClient(mock);
      const result = await client.getDocument("doc-1");

      expect(result).toEqual({
        document: docData,
        childIds: ["child-1"],
      });
      expect(mock.GetDocument).toHaveBeenCalledWith({
        identifier: "doc-1",
        view: undefined,
      });
    });

    it("returns null when not found", async () => {
      const mock = createMockClient();
      const client = new RemoteClient(mock);

      const result = await client.getDocument("nonexistent");
      expect(result).toBeNull();
    });

    it("passes branch in view", async () => {
      const mock = createMockClient({
        GetDocument: vi.fn().mockResolvedValue({ document: null }),
      });
      const client = new RemoteClient(mock);

      await client.getDocument("doc-1", "dev");
      expect(mock.GetDocument).toHaveBeenCalledWith({
        identifier: "doc-1",
        view: { branch: "dev" },
      });
    });
  });

  describe("getAllOperations", () => {
    it("fetches single page of operations grouped by scope", async () => {
      const mock = createMockClient({
        GetDocumentOperations: vi.fn().mockResolvedValue({
          documentOperations: {
            items: [
              makeRemoteOp(0, "global"),
              makeRemoteOp(1, "global"),
              makeRemoteOp(2, "local"),
            ],
            totalCount: 3,
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: null,
          },
        }),
      });

      const client = new RemoteClient(mock);
      const result = await client.getAllOperations("doc-1");

      expect(Object.keys(result.operationsByScope)).toEqual([
        "global",
        "local",
      ]);
      expect(result.operationsByScope["global"]).toHaveLength(2);
      expect(result.operationsByScope["local"]).toHaveLength(1);
    });

    it("paginates through multiple pages", async () => {
      const mockFn = vi
        .fn()
        .mockResolvedValueOnce({
          documentOperations: {
            items: [makeRemoteOp(0)],
            totalCount: 2,
            hasNextPage: true,
            hasPreviousPage: false,
            cursor: "cursor-1",
          },
        })
        .mockResolvedValueOnce({
          documentOperations: {
            items: [makeRemoteOp(1)],
            totalCount: 2,
            hasNextPage: false,
            hasPreviousPage: true,
            cursor: null,
          },
        });

      const mock = createMockClient({
        GetDocumentOperations: mockFn,
      });

      const client = new RemoteClient(mock);
      const result = await client.getAllOperations("doc-1");

      expect(result.operationsByScope["global"]).toHaveLength(2);
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Second call should use the cursor
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockFn.mock.calls[1][0].paging.cursor).toBe("cursor-1");
    });
  });

  describe("pushActions", () => {
    it("calls MutateDocument with correct args", async () => {
      const mock = createMockClient();
      const client = new RemoteClient(mock);

      const actions = [
        { type: "SET_NAME", input: { name: "test" }, scope: "global" },
      ];
      await client.pushActions("doc-1", actions);

      expect(mock.MutateDocument).toHaveBeenCalledWith({
        documentIdentifier: "doc-1",
        actions,
        view: undefined,
      });
    });
  });

  describe("createDocument", () => {
    it("calls CreateDocument with correct args", async () => {
      const mock = createMockClient();
      const client = new RemoteClient(mock);

      await client.createDocument({ type: "test" }, "parent-1");

      expect(mock.CreateDocument).toHaveBeenCalledWith({
        document: { type: "test" },
        parentIdentifier: "parent-1",
      });
    });
  });

  describe("createEmptyDocument", () => {
    it("calls CreateEmptyDocument with correct args", async () => {
      const mock = createMockClient();
      const client = new RemoteClient(mock);

      await client.createEmptyDocument("test/type", "parent-1");

      expect(mock.CreateEmptyDocument).toHaveBeenCalledWith({
        documentType: "test/type",
        parentIdentifier: "parent-1",
      });
    });
  });
});
