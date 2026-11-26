import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { testSigner } from "@powerhousedao/shared/testing";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { RemoteClient } from "../../src/remote-controller/remote-client.js";
import type { RemoteControllerGraphQLClient } from "../../src/remote-controller/types.js";

function createMockClient(
  overrides: Partial<RemoteControllerGraphQLClient> = {},
): RemoteControllerGraphQLClient {
  return {
    GetDocument: vi.fn().mockResolvedValue({ document: null }),
    GetDocumentWithOperations: vi.fn().mockResolvedValue({ document: null }),
    GetDocumentOperations: vi.fn().mockResolvedValue({
      documentOperations: {
        items: [],
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
  } as unknown as RemoteControllerGraphQLClient;
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
        idOrSlug: "doc-1",
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
        idOrSlug: "doc-1",
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
            hasNextPage: true,
            hasPreviousPage: false,
            cursor: "cursor-1",
          },
        })
        .mockResolvedValueOnce({
          documentOperations: {
            items: [makeRemoteOp(1)],
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

      // Carries an id and a timestamp because the mutation's input requires
      // them; the fixture used to omit both, which is the hole this closes.
      const actions = [
        {
          id: "act-1",
          type: "SET_NAME",
          input: { name: "test" },
          scope: "global",
          timestampUtcMs: "2026-01-01T00:00:00.000Z",
        },
      ];
      await client.pushActions("doc-1", actions);

      expect(mock.MutateDocument).toHaveBeenCalledWith({
        documentIdOrSlug: "doc-1",
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
        parentIdOrSlug: "parent-1",
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
        parentIdOrSlug: "parent-1",
      });
    });
  });

  describe("with a signer", () => {
    type SentAction = {
      type: string;
      input: Record<string, unknown>;
      context?: { signer?: { user?: { address?: string } } };
    };

    function served(documents: Record<string, ReturnType<typeof makeDocData>>) {
      return vi.fn(({ idOrSlug }: { idOrSlug: string }) =>
        Promise.resolve({
          document: documents[idOrSlug]
            ? { document: documents[idOrSlug], childIds: [] }
            : null,
        }),
      );
    }

    it("signs the creation in one job and files it in a document drive", async () => {
      const signer = await testSigner("0xcaller");
      const document = documentModelDocumentModelModule.utils.createDocument();
      document.header.protocolVersions = { "base-reducer": 2 };
      const id = document.header.id;
      const drive = {
        ...makeDocData("drive-1"),
        documentType: "powerhouse/document-drive",
        state: driveDocumentModelModule.utils.createState(),
      };
      const mock = createMockClient({
        GetDocument: served({ "drive-1": drive, [id]: makeDocData(id) }),
        ExecuteBatch: vi.fn().mockResolvedValue({
          executeBatch: {
            jobs: [{ key: "create", job: { status: "READ_READY" } }],
          },
        }),
      } as Partial<RemoteControllerGraphQLClient>);
      const client = new RemoteClient(mock, undefined, signer);

      const created = await client.createDocument(document, "drive-1");

      expect(created.id).toBe(id);
      expect(mock.CreateDocument).not.toHaveBeenCalled();
      const [{ jobs }] = vi.mocked(mock.ExecuteBatch!).mock.calls[0];
      const jobList = jobs as readonly {
        documentIdOrSlug: string;
        actions: readonly SentAction[];
      }[];
      expect(jobList).toHaveLength(1);
      expect(jobList[0].documentIdOrSlug).toBe(id);
      expect(jobList[0].actions.map((action) => action.type)).toEqual([
        "CREATE_DOCUMENT",
        "UPGRADE_DOCUMENT",
        "ADD_RELATIONSHIP",
      ]);
      expect(jobList[0].actions[2].input).toMatchObject({
        sourceId: "drive-1",
        targetId: id,
        relationshipType: "child",
      });
      for (const action of jobList[0].actions) {
        expect(action.context?.signer?.user?.address).toBe("0xcaller");
      }
      const [filed] = vi.mocked(mock.MutateDocument).mock.calls[0];
      expect(filed.documentIdOrSlug).toBe("drive-1");
      const [addFile] = filed.actions as readonly SentAction[];
      expect(addFile.type).toBe("ADD_FILE");
      expect(addFile.input).toMatchObject({ id });
      expect(addFile.context?.signer?.user?.address).toBe("0xcaller");
    });

    it("refuses a parent the remote does not serve", async () => {
      const signer = await testSigner("0xcaller");
      const document = documentModelDocumentModelModule.utils.createDocument();
      const mock = createMockClient({
        ExecuteBatch: vi.fn(),
      } as Partial<RemoteControllerGraphQLClient>);
      const client = new RemoteClient(mock, undefined, signer);

      await expect(client.createDocument(document, "missing")).rejects.toThrow(
        /no document with that identifier/,
      );
      expect(mock.ExecuteBatch).not.toHaveBeenCalled();
      expect(mock.CreateDocument).not.toHaveBeenCalled();
    });

    it("deletes with the signer's own DELETE_DOCUMENT", async () => {
      const signer = await testSigner("0xcaller");
      const mock = createMockClient({
        GetDocument: served({ "my-slug": makeDocData("doc-9") }),
        DeleteDocumentSigned: vi
          .fn()
          .mockResolvedValue({ deleteDocument: true }),
      } as Partial<RemoteControllerGraphQLClient>);
      const client = new RemoteClient(mock, undefined, signer);

      expect(await client.deleteDocument("my-slug")).toBe(true);

      expect(mock.DeleteDocument).not.toHaveBeenCalled();
      const [variables] = vi.mocked(mock.DeleteDocumentSigned!).mock.calls[0];
      expect(variables.idOrSlug).toBe("doc-9");
      const signed = variables.signedDelete as SentAction;
      expect(signed.type).toBe("DELETE_DOCUMENT");
      expect(signed.input).toEqual({ documentId: "doc-9" });
      expect(signed.context?.signer?.user?.address).toBe("0xcaller");
    });
  });
});
