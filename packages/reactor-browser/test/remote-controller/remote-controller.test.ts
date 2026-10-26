import {
  DocumentModelController,
  documentModelDocumentModelModule,
} from "document-model";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  creationActions,
  NoUndoRedoTargetError,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import type {
  GetDocumentOperationsQuery,
  GetDocumentQuery,
  PagingInput,
  ViewFilterInput,
} from "../../src/graphql/gen/schema.js";
import { RemoteDocumentController } from "../../src/remote-controller/remote-controller.js";
import type {
  RemoteControllerGraphQLClient,
  RemoteOperation,
} from "../../src/remote-controller/types.js";
import { ConflictError } from "../../src/remote-controller/utils.js";

/** Helper to make a document data response matching the PHDocumentFields fragment. */
function makeDocData(
  overrides: Partial<{
    id: string;
    name: string;
    state: NonNullable<unknown>;
    revisionsList: { scope: string; revision: number }[];
  }> = {},
) {
  return {
    id: overrides.id ?? "doc-1",
    slug: "test-doc",
    name: overrides.name ?? "Test Doc",
    documentType: "powerhouse/document-model",
    state: overrides.state ?? { global: {}, local: {} },
    createdAtUtcIso: "2024-01-01T00:00:00Z",
    lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
    revisionsList: overrides.revisionsList ?? [
      { scope: "global", revision: 0 },
    ],
  };
}

/** Helper to wrap doc data in a GetDocumentWithOperations response. */
function makeDocWithOpsResponse(
  docData: ReturnType<typeof makeDocData>,
  operations: {
    items: RemoteOperation[];
    cursor?: string | null;
    hasNextPage?: boolean;
  } = {
    items: [],
  },
) {
  return {
    document: {
      document: {
        ...docData,
        operations: {
          items: operations.items,
          hasNextPage: operations.hasNextPage ?? false,
          hasPreviousPage: false,
          cursor: operations.cursor ?? null,
        },
      },
      childIds: [],
    },
  };
}

/**
 * Create a mock GraphQL client.
 * If `GetDocumentWithOperations` is not explicitly provided, it is
 * derived automatically: if `GetDocument` is overridden, its return
 * value is extended with an empty operations page; otherwise the
 * default doc data is used.
 */
function createMockClient(
  overrides: Partial<RemoteControllerGraphQLClient> = {},
): RemoteControllerGraphQLClient {
  const defaultDoc = makeDocData();

  // Build GetDocumentWithOperations from GetDocument if not explicitly set
  const getDocWithOps =
    overrides.GetDocumentWithOperations ??
    vi.fn().mockResolvedValue(makeDocWithOpsResponse(defaultDoc));

  const getDocument =
    overrides.GetDocument ??
    vi.fn().mockResolvedValue({
      document: {
        document: defaultDoc,
        childIds: [],
      },
    });

  const getDocOps =
    overrides.GetDocumentOperations ??
    vi.fn().mockResolvedValue({
      documentOperations: {
        items: [],
        hasNextPage: false,
        hasPreviousPage: false,
        cursor: null,
      },
    });

  // Default BatchGetDocumentWithOperations: delegates to GetDocument + GetDocumentOperations
  const batchGetDocWithOps =
    overrides.BatchGetDocumentWithOperations ??
    vi
      .fn()
      .mockImplementation(
        async (
          identifier: string,
          view: unknown,
          filters: { documentId: string }[],
          pagings: unknown[],
        ) => {
          const docResult = (await getDocument({
            identifier,
            view: view as ViewFilterInput,
          })) as GetDocumentQuery;
          const operations = await Promise.all(
            filters.map((filter, i) =>
              (
                getDocOps({
                  filter,
                  paging: pagings[i] as PagingInput,
                }) as Promise<GetDocumentOperationsQuery>
              ).then((r) => r.documentOperations),
            ),
          );
          return { document: docResult.document, operations };
        },
      );

  return {
    GetDocument: getDocument,
    GetDocumentWithOperations: getDocWithOps,
    GetDocumentOperations: getDocOps,
    MutateDocument: vi.fn().mockResolvedValue({
      mutateDocument: makeDocData({
        revisionsList: [{ scope: "global", revision: 1 }],
      }),
    }),
    CreateDocument: vi
      .fn()
      .mockImplementation(
        ({ document }: { document: { header: { id: string } } }) =>
          Promise.resolve({
            createDocument: makeDocData({ id: document.header.id }),
          }),
      ),
    GetCreateDefaults: vi.fn().mockResolvedValue({
      createDefaults: {
        signaturePolicy: "v2-required",
        protocolVersions: { "base-reducer": 2 },
      },
    }),
    GetCreateProtocolVersions: vi.fn().mockResolvedValue({
      createDefaults: { protocolVersions: { "base-reducer": 2 } },
    }),
    CreateEmptyDocument: vi.fn().mockResolvedValue({
      createEmptyDocument: makeDocData({ id: "new-doc-1" }),
    }),
    DeleteDocument: vi.fn().mockResolvedValue({
      deleteDocument: true,
    }),
    BatchGetDocumentOperations: overrides.BatchGetDocumentOperations,
    BatchGetDocumentWithOperations: batchGetDocWithOps,
    ...overrides,
  } as unknown as RemoteControllerGraphQLClient;
}

/** The document the controller created the remote from. */
function createdDocument(client: RemoteControllerGraphQLClient): PHDocument {
  return vi.mocked(client.CreateDocument).mock.calls[0][0]
    .document as PHDocument;
}

describe("RemoteDocumentController", () => {
  describe("pull (static factory)", () => {
    it("creates controller from remote document", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      expect(controller.status.documentId).toBe("doc-1");
      expect(controller.status.connected).toBe(true);
      expect(controller.status.pendingActionCount).toBe(0);
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(1);
    });

    it("creates empty controller when documentId is empty", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      expect(controller.status.connected).toBe(false);
      expect(controller.status.pendingActionCount).toBe(0);
      // Should NOT call GetDocument for empty id
      expect(client.GetDocument).not.toHaveBeenCalled();
    });
  });

  describe("from (static factory)", () => {
    it("wraps an existing controller", () => {
      const client = createMockClient();
      const local = new DocumentModelController();
      local.setName({ name: "Local Name" });

      const remote = RemoteDocumentController.from(local, {
        client,
        documentId: "doc-1",
        mode: "batch",
      });

      // State should reflect the local controller's state
      expect(remote.header.name).toBe("Local Name");
      // Pre-existing actions are not tracked
      expect(remote.status.pendingActionCount).toBe(0);
    });
  });

  describe("action interception", () => {
    it("applies actions locally and tracks them", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      controller.setName({ name: "New Name" });

      expect(controller.header.name).toBe("New Name");
      expect(controller.status.pendingActionCount).toBe(1);
    });

    it("supports chaining", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      controller.setName({ name: "Name 1" }).setName({ name: "Name 2" });

      expect(controller.header.name).toBe("Name 2");
      expect(controller.status.pendingActionCount).toBe(2);
    });

    it("applies setPreferredEditor through the dynamic proxy", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      controller.setPreferredEditor({ preferredEditor: "custom-editor" });

      expect(controller.header.meta?.preferredEditor).toBe("custom-editor");
      expect(controller.status.pendingActionCount).toBe(1);

      controller.setPreferredEditor({ preferredEditor: null });

      expect(controller.header.meta?.preferredEditor).toBeUndefined();
      expect(controller.status.pendingActionCount).toBe(2);
    });
  });

  describe("push", () => {
    it("creates document on remote when documentId is empty", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      controller.setName({ name: "New Doc" });
      const result = await controller.push();

      // Created from the local header, then pushed
      expect(client.CreateDocument).toHaveBeenCalledTimes(1);
      expect(client.CreateEmptyDocument).not.toHaveBeenCalled();
      expect(client.MutateDocument).toHaveBeenCalledTimes(1);
      expect(result.actionCount).toBe(1);
      expect(controller.status.documentId).toBe(
        createdDocument(client).header.id,
      );
    });

    it("pushes actions to existing document", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      controller.setName({ name: "Updated" });

      const result = await controller.push();

      expect(client.MutateDocument).toHaveBeenCalledTimes(1);
      expect(result.actionCount).toBe(1);
      // After push, tracker should be cleared
      expect(controller.status.pendingActionCount).toBe(0);
    });

    it("sends actions with prevOpHash context", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      controller.setName({ name: "Test" });
      await controller.push();

      // Read off the declared input type rather than a hand-written shape: the
      // mutation takes ActionInput now, so the context fields are typed.
      const mutateCall = vi.mocked(client.MutateDocument).mock.calls[0][0];
      const actions = mutateCall.actions;

      expect(actions).toHaveLength(1);
      expect(actions[0].context).toBeDefined();
      expect(typeof actions[0].context!.prevOpHash).toBe("string");
      expect(typeof actions[0].context!.prevOpIndex).toBe("number");
    });

    it("pulls after push to reconcile with remote", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      controller.setName({ name: "Before Push" });
      await controller.push();

      // GetDocumentWithOperations for initial pull;
      // post-push incremental pull uses BatchGetDocumentWithOperations
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(1);
      expect(client.BatchGetDocumentWithOperations).toHaveBeenCalledTimes(1);
    });
  });

  describe("pull (instance method)", () => {
    it("throws when no documentId is set", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      await expect(controller.pull()).rejects.toThrow(
        "Cannot pull: no document ID set",
      );
    });

    it("pulls latest state from remote", async () => {
      const client = createMockClient({
        GetDocumentWithOperations: vi
          .fn()
          .mockResolvedValue(
            makeDocWithOpsResponse(makeDocData({ name: "Remote Name" })),
          ),
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      expect(controller.header.name).toBe("Remote Name");
    });
  });

  describe("signing", () => {
    it("signs actions when signer is configured", async () => {
      const mockSigner = {
        user: {
          address: "0x123",
          networkId: "eip155:1",
          chainId: 1,
        },
        app: { name: "test-app", key: "key-123" },
        publicKey: {} as CryptoKey,
        sign: vi.fn(),
        verify: vi.fn(),
        signAction: vi.fn().mockResolvedValue(["", "", "", "", "sig-123"]),
      };

      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          signer: mockSigner,
        },
      );

      controller.setName({ name: "Signed" });
      await controller.push();

      // Signer should have been called
      expect(mockSigner.signAction).toHaveBeenCalledTimes(1);

      // Action should include signer context
      const mutateCall = vi.mocked(client.MutateDocument).mock.calls[0][0];
      const actions = mutateCall.actions;
      expect(actions[0].context!.signer).toBeDefined();
      expect(actions[0].context!.signer!.user!.address).toBe("0x123");
      expect(actions[0].context!.signer!.app!.name).toBe("test-app");
      expect(actions[0].context!.signer!.signatures).toHaveLength(1);
    });

    it("signs for the remote's document id and the configured branch", async () => {
      const mockSigner = {
        user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
        app: { name: "test-app", key: "key-123" },
        publicKey: {} as CryptoKey,
        sign: vi.fn(),
        verify: vi.fn(),
        signAction: vi.fn().mockResolvedValue(["", "", "", "", "sig-123"]),
      };

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client: createMockClient(),
          documentId: "my-slug",
          branch: "draft",
          mode: "batch",
          signer: mockSigner,
        },
      );

      controller.setName({ name: "Signed" });
      await controller.push();

      expect(mockSigner.signAction.mock.calls[0][1]).toEqual({
        documentId: "doc-1",
        branch: "draft",
      });
    });

    function slugSigner() {
      return {
        user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
        app: { name: "test-app", key: "key-123" },
        publicKey: {} as CryptoKey,
        sign: vi.fn(),
        verify: vi.fn(),
        signAction: vi.fn().mockResolvedValue(["", "", "", "", "sig-123"]),
      };
    }

    it("resolves a slug to the remote's id before signing, without a pull", async () => {
      const mockSigner = slugSigner();
      const client = createMockClient();
      const controller = RemoteDocumentController.from(
        new DocumentModelController(),
        {
          client,
          documentId: "my-slug",
          mode: "batch",
          signer: mockSigner,
        },
      );

      controller.setName({ name: "Signed" });
      await controller.push();

      expect(client.GetDocument).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: "my-slug" }),
      );
      expect(mockSigner.signAction.mock.calls[0][1]).toEqual({
        documentId: "doc-1",
        branch: "main",
      });
    });

    it("fails the push without signing when the identifier does not resolve", async () => {
      const mockSigner = slugSigner();
      const client = createMockClient({
        GetDocument: vi.fn().mockResolvedValue({ document: null }),
      });
      const controller = RemoteDocumentController.from(
        new DocumentModelController(),
        {
          client,
          documentId: "missing-slug",
          mode: "batch",
          signer: mockSigner,
        },
      );

      controller.setName({ name: "Signed" });

      await expect(controller.push()).rejects.toThrow(
        'Cannot sign for "missing-slug": no document with that identifier on the remote',
      );
      expect(mockSigner.signAction).not.toHaveBeenCalled();
      expect(client.MutateDocument).not.toHaveBeenCalled();
      expect(controller.status.pendingActionCount).toBe(1);
    });

    it("fails the push without signing when the lookup throws", async () => {
      const mockSigner = slugSigner();
      const client = createMockClient({
        GetDocument: vi.fn().mockRejectedValue(new Error("offline")),
      });
      const controller = RemoteDocumentController.from(
        new DocumentModelController(),
        {
          client,
          documentId: "my-slug",
          mode: "batch",
          signer: mockSigner,
        },
      );

      controller.setName({ name: "Signed" });

      await expect(controller.push()).rejects.toThrow(
        'Cannot sign for "my-slug": its document id could not be resolved on the remote',
      );
      expect(mockSigner.signAction).not.toHaveBeenCalled();
      expect(controller.status.pendingActionCount).toBe(1);
    });
  });

  describe("streaming mode", () => {
    it("auto-pushes after actions in streaming mode", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "streaming",
        },
      );

      controller.setName({ name: "Stream 1" }).setName({ name: "Stream 2" });

      // Wait for the queued push to complete (microtask + async push chain)
      await vi.waitFor(() => {
        expect(client.MutateDocument).toHaveBeenCalledTimes(1);
      });

      const mutateCall = vi.mocked(client.MutateDocument).mock.calls[0][0];
      expect((mutateCall.actions as unknown[]).length).toBe(2);
    });
  });

  describe("status", () => {
    it("reports correct remote revision after pull", async () => {
      const client = createMockClient({
        GetDocumentWithOperations: vi.fn().mockResolvedValue(
          makeDocWithOpsResponse(
            makeDocData({
              revisionsList: [
                { scope: "global", revision: 5 },
                { scope: "local", revision: 3 },
              ],
            }),
          ),
        ),
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      expect(controller.status.remoteRevision).toEqual({
        global: 5,
        local: 3,
      });
    });
  });

  describe("conflict detection", () => {
    /** Create a client where the remote revision has advanced since pull. */
    function createConflictClient() {
      // GetDocumentWithOperations: initial pull sees revision 1, post-push pull sees revision 3
      const getDocWithOps = vi
        .fn()
        .mockResolvedValueOnce(
          makeDocWithOpsResponse(
            makeDocData({
              revisionsList: [{ scope: "global", revision: 1 }],
            }),
          ),
        )
        .mockResolvedValue(
          makeDocWithOpsResponse(
            makeDocData({
              revisionsList: [{ scope: "global", revision: 3 }],
            }),
          ),
        );

      // GetDocument: conflict check during push sees revision 2 (remote advanced)
      const getDocumentFn = vi.fn().mockResolvedValue({
        document: {
          document: makeDocData({
            revisionsList: [{ scope: "global", revision: 2 }],
          }),
          childIds: [],
        },
      });

      return createMockClient({
        GetDocumentWithOperations: getDocWithOps,
        GetDocument: getDocumentFn,
        GetDocumentOperations: vi.fn().mockResolvedValue({
          documentOperations: {
            items: [
              {
                index: 1,
                timestampUtcMs: "1000",
                hash: "remote-hash",
                skip: 0,
                error: null,
                id: "remote-op",
                action: {
                  id: "remote-action",
                  type: "SET_MODEL_DESCRIPTION",
                  timestampUtcMs: "1000",
                  input: { description: "remote change" },
                  scope: "global",
                  context: null,
                },
              },
            ],
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: null,
          },
        }),
      });
    }

    it("reject strategy throws ConflictError", async () => {
      const client = createConflictClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          onConflict: "reject",
        },
      );

      controller.setName({ name: "Local change" });

      await expect(controller.push()).rejects.toThrow(ConflictError);
    });

    it("reject strategy preserves pending actions after failure", async () => {
      const client = createConflictClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          onConflict: "reject",
        },
      );

      controller.setName({ name: "Local change" });

      try {
        await controller.push();
      } catch {
        // expected
      }

      // Actions should be restored for retry
      expect(controller.status.pendingActionCount).toBe(1);
    });

    it("rebase strategy pulls and replays actions", async () => {
      const client = createConflictClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          onConflict: "rebase",
        },
      );

      controller.setName({ name: "Rebased Name" });
      const result = await controller.push();

      expect(result.actionCount).toBe(1);
      // MutateDocument should have been called with the rebased actions
      expect(client.MutateDocument).toHaveBeenCalledTimes(1);
    });

    it("custom merge handler receives conflict info and returns actions", async () => {
      const client = createConflictClient();
      let receivedConflict: unknown;

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          onConflict: (conflict) => {
            receivedConflict = conflict;
            return [
              {
                type: "SET_NAME",
                input: { name: "Merged" },
                scope: "global",
                id: "merged-1",
                timestampUtcMs: "1000",
              },
            ];
          },
        },
      );

      controller.setName({ name: "Local" });
      const result = await controller.push();

      expect(receivedConflict).toBeDefined();
      expect(result.actionCount).toBe(1);
      expect(client.MutateDocument).toHaveBeenCalledTimes(1);
    });

    it("skips conflict check when remote has not changed", async () => {
      // Both pull and conflict check return same revision
      const client = createMockClient({
        GetDocumentWithOperations: vi.fn().mockResolvedValue(
          makeDocWithOpsResponse(
            makeDocData({
              revisionsList: [{ scope: "global", revision: 1 }],
            }),
          ),
        ),
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          onConflict: "reject",
        },
      );

      controller.setName({ name: "No conflict" });
      // Should not throw — revision hasn't changed
      const result = await controller.push();
      expect(result.actionCount).toBe(1);
    });

    it("skips conflict check when onConflict is not set", async () => {
      const client = createConflictClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
          // No onConflict — last-write-wins
        },
      );

      controller.setName({ name: "No check" });
      const result = await controller.push();

      // Should push without checking
      expect(result.actionCount).toBe(1);
      // GetDocumentWithOperations called only for initial pull;
      // post-push incremental pull uses BatchGetDocumentWithOperations
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(1);
      expect(client.BatchGetDocumentWithOperations).toHaveBeenCalledTimes(1);
    });
  });

  describe(".document getter", () => {
    it("returns the underlying PHDocument", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      const doc = controller.document;
      expect(doc).toBeDefined();
      expect(doc.header.name).toBe(controller.header.name);
    });

    it("reflects state changes after actions", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      controller.setName({ name: "Updated" });
      expect(controller.document.header.name).toBe("Updated");
    });
  });

  describe("onChange", () => {
    it("fires listener with source 'action' when action is applied", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      const events: Array<{ source: string }> = [];
      controller.onChange((event) => events.push({ source: event.source }));

      controller.setName({ name: "Test" });

      expect(events).toHaveLength(1);
      expect(events[0].source).toBe("action");
    });

    it("fires listener with source 'pull' after pull", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      const events: Array<{ source: string }> = [];
      controller.onChange((event) => events.push({ source: event.source }));

      await controller.pull();

      expect(events).toHaveLength(1);
      expect(events[0].source).toBe("pull");
    });

    it("provides the document in the event", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      let receivedDoc: unknown;
      controller.onChange((event) => {
        receivedDoc = event.document;
      });

      controller.setName({ name: "Doc Event" });

      expect(receivedDoc).toBeDefined();
      expect((receivedDoc as { header: { name: string } }).header.name).toBe(
        "Doc Event",
      );
    });

    it("returns an unsubscribe function that stops notifications", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      const events: unknown[] = [];
      const unsubscribe = controller.onChange((event) => events.push(event));

      controller.setName({ name: "Before" });
      expect(events).toHaveLength(1);

      unsubscribe();

      controller.setName({ name: "After" });
      expect(events).toHaveLength(1); // no new event
    });

    it("supports multiple listeners", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "",
          mode: "batch",
        },
      );

      const events1: unknown[] = [];
      const events2: unknown[] = [];
      controller.onChange(() => events1.push(1));
      controller.onChange(() => events2.push(1));

      controller.setName({ name: "Multi" });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });
  });

  describe("incremental fetch via sinceRevision", () => {
    const makeOp = (index: number) => ({
      index,
      timestampUtcMs: String(index * 1000),
      hash: `hash-${index}`,
      skip: 0,
      error: null,
      id: `op-${index}`,
      action: {
        id: `action-${index}`,
        type: "SET_NAME",
        timestampUtcMs: String(index * 1000),
        input: { name: `Name ${index}` },
        scope: "global",
        context: null,
      },
    });

    it("uses BatchGetDocumentWithOperations on subsequent pulls", async () => {
      const client = createMockClient();

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      // First pull uses GetDocumentWithOperations
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(1);
      expect(client.BatchGetDocumentWithOperations).toHaveBeenCalledTimes(0);

      // Second pull uses BatchGetDocumentWithOperations (incremental path)
      await controller.pull();
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(1);
      expect(client.BatchGetDocumentWithOperations).toHaveBeenCalledTimes(1);
    });

    it("merges new operations with existing ones on incremental pull", async () => {
      // GetDocumentOperations returns ops filtered by sinceRevision
      const getDocOps = vi
        .fn<RemoteControllerGraphQLClient["GetDocumentOperations"]>()
        .mockImplementation((args) => {
          const since = args.filter?.sinceRevision ?? 0;
          const allOps = [makeOp(0), makeOp(1), makeOp(2)];
          const filtered = allOps.filter((op) => op.index >= since);
          return Promise.resolve({
            documentOperations: {
              items: filtered,
              hasNextPage: false,
              hasPreviousPage: false,
              cursor: null,
            },
          });
        });

      const client = createMockClient({
        GetDocumentWithOperations: vi.fn().mockResolvedValue(
          makeDocWithOpsResponse(
            makeDocData({
              revisionsList: [{ scope: "global", revision: 2 }],
            }),
            { items: [makeOp(0), makeOp(1)] },
          ),
        ),
        // Incremental pull: BatchGetDocumentWithOperations delegates to GetDocument + GetDocumentOperations
        GetDocument: vi.fn().mockResolvedValue({
          document: {
            document: makeDocData({
              revisionsList: [{ scope: "global", revision: 3 }],
            }),
            childIds: [],
          },
        }),
        GetDocumentOperations: getDocOps,
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      // After first pull: 2 operations
      expect(controller.operations["global"]).toHaveLength(2);

      await controller.pull();

      // After incremental pull: 2 existing + 1 new = 3 operations
      expect(controller.operations["global"]).toHaveLength(3);
      // BatchGetDocumentWithOperations delegates to GetDocumentOperations per scope
      expect(getDocOps).toHaveBeenCalledTimes(1);
    });

    it("falls back to full fetch when incremental merge produces count mismatch", async () => {
      let getDocOpsCallCount = 0;
      const getDocOps = vi
        .fn<RemoteControllerGraphQLClient["GetDocumentOperations"]>()
        .mockImplementation(() => {
          getDocOpsCallCount++;
          if (getDocOpsCallCount === 1) {
            // Incremental fetch returns 0 new ops (simulating data loss)
            // Merge: 1 existing + 0 new = 1 ≠ 3 → mismatch → fallback
            return Promise.resolve({
              documentOperations: {
                items: [],
                hasNextPage: false,
                hasPreviousPage: false,
                cursor: null,
              },
            });
          }
          // Fallback full fetch returns all 3 ops
          return Promise.resolve({
            documentOperations: {
              items: [makeOp(0), makeOp(1), makeOp(2)],
              hasNextPage: false,
              hasPreviousPage: false,
              cursor: null,
            },
          });
        });

      const client = createMockClient({
        GetDocumentWithOperations: vi.fn().mockResolvedValue(
          makeDocWithOpsResponse(
            makeDocData({
              revisionsList: [{ scope: "global", revision: 1 }],
            }),
            { items: [makeOp(0)] },
          ),
        ),
        // Incremental pull: revision jumped to 3
        GetDocument: vi.fn().mockResolvedValue({
          document: {
            document: makeDocData({
              revisionsList: [{ scope: "global", revision: 3 }],
            }),
            childIds: [],
          },
        }),
        GetDocumentOperations: getDocOps,
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      expect(controller.operations["global"]).toHaveLength(1);

      // Second pull: incremental fails validation, falls back to full fetch
      await controller.pull();

      expect(controller.operations["global"]).toHaveLength(3);
      // GetDocumentOperations called twice: once for incremental, once for fallback
      expect(getDocOps).toHaveBeenCalledTimes(2);
    });
  });

  describe("push failure recovery", () => {
    it("restores actions when MutateDocument fails", async () => {
      const client = createMockClient({
        MutateDocument: vi.fn().mockRejectedValue(new Error("Network error")),
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      controller.setName({ name: "Will fail" });
      expect(controller.status.pendingActionCount).toBe(1);

      await expect(controller.push()).rejects.toThrow("Network error");

      // Actions should be restored for retry
      expect(controller.status.pendingActionCount).toBe(1);
    });

    it("does not restore actions when pull fails after successful push", async () => {
      const client = createMockClient({
        // Post-push incremental pull uses GetDocument — make it fail
        GetDocument: vi.fn().mockRejectedValue(new Error("Pull failed")),
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      controller.setName({ name: "Push then fail pull" });

      await expect(controller.push()).rejects.toThrow("Pull failed");

      // Actions were already pushed — must NOT be restored
      expect(controller.status.pendingActionCount).toBe(0);
    });

    it("restores actions when CreateDocument fails for new docs", async () => {
      const client = createMockClient({
        CreateDocument: vi.fn().mockRejectedValue(new Error("Create failed")),
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          mode: "batch",
          parentIdentifier: "drive-1",
        },
      );

      controller.setName({ name: "New doc" });

      await expect(controller.push()).rejects.toThrow("Create failed");

      expect(controller.status.pendingActionCount).toBe(1);
    });
  });

  describe("undo and redo", () => {
    const signer = () => ({
      user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
      app: { name: "test-app", key: "key-123" },
      publicKey: {} as CryptoKey,
      sign: vi.fn(),
      verify: vi.fn(),
      signAction: vi.fn().mockResolvedValue(["", "", "", "", "sig-123"]),
    });

    const contentOp = (index: number, name: string) => ({
      index,
      timestampUtcMs: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      hash: `hash-${index}`,
      skip: 0,
      error: null,
      id: `op-${index}`,
      action: {
        id: `action-${index}`,
        type: "SET_MODEL_NAME",
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 0, 0, index),
        ).toISOString(),
        input: { name },
        scope: "global",
        context: null,
      },
    });

    function remoteAt(baseReducer: number) {
      const docData = {
        ...makeDocData({
          state: documentModelDocumentModelModule.utils.createState(),
          revisionsList: [{ scope: "global", revision: 1 }],
        }),
        protocolVersions: { "base-reducer": baseReducer },
      };
      return createMockClient({
        GetDocumentWithOperations: vi.fn().mockResolvedValue(
          makeDocWithOpsResponse(docData as never, {
            items: [contentOp(0, "remote") as never],
          }),
        ),
      });
    }

    function pushedActions(client: RemoteControllerGraphQLClient) {
      return vi.mocked(client.MutateDocument).mock.calls[0][0].actions;
    }

    it("pulls the remote header's protocol versions", async () => {
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client: remoteAt(3), documentId: "doc-1" },
      );

      expect(controller.header.protocolVersions?.["base-reducer"]).toBe(3);
    });

    it("signs a RETRACT of the last content row on base-reducer 3", async () => {
      const client = remoteAt(3);
      const author = signer();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1", signer: author },
      );

      controller.setModelName({ name: "local" });
      const local = controller.operations.global.at(-1)!.action.id;
      controller.undo();

      expect(controller.state.global.name).toBe("remote");
      await controller.push();
      const actions = pushedActions(client);
      expect(actions.map((action) => action.type)).toEqual([
        "SET_MODEL_NAME",
        "RETRACT",
      ]);
      expect(actions[1].input).toEqual({ target: local });
      expect(actions[1].context!.signer!.user!.address).toBe("0x123");
      expect(author.signAction).toHaveBeenCalledTimes(2);
    });

    it("redoes by retracting the retraction on base-reducer 3", async () => {
      const client = remoteAt(3);
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1" },
      );

      controller.undo();
      const undone = controller.operations.global.at(-1)!.action.id;
      expect(controller.state.global.name).toBe("");
      controller.redo();

      expect(controller.state.global.name).toBe("remote");
      await controller.push();
      const actions = pushedActions(client);
      expect(actions.map((action) => action.type)).toEqual([
        "RETRACT",
        "RETRACT",
      ]);
      expect(actions[0].input).toEqual({ target: "action-0" });
      expect(actions[1].input).toEqual({ target: undone });
    });

    it("refuses an undo with nothing to retract on base-reducer 3", async () => {
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client: remoteAt(3), documentId: "doc-1" },
      );
      controller.undo();

      expect(() => controller.undo()).toThrow("nothing to undo");
      expect(controller.status.pendingActionCount).toBe(1);
    });

    it.each(["auth", "document"])(
      "finds no target in the %s scope on base-reducer 3",
      async (scope) => {
        const controller = await RemoteDocumentController.pull(
          DocumentModelController,
          { client: remoteAt(3), documentId: "doc-1" },
        );
        controller.setModelName({ name: "local" });

        expect(() => controller.undo(scope)).toThrow(NoUndoRedoTargetError);
        expect(() => controller.redo(scope)).toThrow(NoUndoRedoTargetError);
        expect(controller.status.pendingActionCount).toBe(1);
      },
    );

    // Unchanged below base-reducer 3: the local UNDO and REDO fail as before.
    it.each([
      [1, "auth", /UNDO is not permitted/, /REDO is not permitted/],
      [1, "document", /is not iterable/, /no operations in the clipboard/],
      [2, "auth", /UNDO is not permitted/, /REDO is not permitted/],
      [
        2,
        "document",
        /no more operations to undo/,
        /no operations in the clipboard/,
      ],
    ] as const)(
      "still fails a local undo below base-reducer 3 (v%s %s)",
      async (baseReducer, scope, undoError, redoError) => {
        const controller = await RemoteDocumentController.pull(
          DocumentModelController,
          { client: remoteAt(baseReducer), documentId: "doc-1" },
        );
        controller.setModelName({ name: "local" });

        expect(() => controller.undo(scope)).toThrow(undoError);
        expect(() => controller.redo(scope)).toThrow(redoError);
        expect(controller.status.pendingActionCount).toBe(1);
      },
    );

    it("replays a pending RETRACT on rebase", async () => {
      const v3 = (revision: number) => ({
        ...makeDocData({
          state: documentModelDocumentModelModule.utils.createState(),
          revisionsList: [{ scope: "global", revision }],
        }),
        protocolVersions: { "base-reducer": 3 },
      });
      const page = (items: unknown[]) => ({
        items,
        hasNextPage: false,
        hasPreviousPage: false,
        cursor: null,
      });
      const client = createMockClient({
        GetDocumentWithOperations: vi
          .fn()
          .mockResolvedValueOnce(
            makeDocWithOpsResponse(v3(1) as never, {
              items: [contentOp(0, "remote") as never],
            }),
          )
          .mockResolvedValue(
            makeDocWithOpsResponse(v3(2) as never, {
              items: [contentOp(1, "other") as never],
            }),
          ),
        GetDocument: vi.fn().mockResolvedValue({
          document: { document: v3(2), childIds: [] },
        }),
        GetDocumentOperations: vi.fn().mockResolvedValue({
          documentOperations: page([contentOp(1, "other")]),
        }),
      });
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1", onConflict: "rebase" },
      );

      controller.undo();
      await controller.push();

      const actions = pushedActions(client);
      expect(actions.map((action) => action.type)).toEqual(["RETRACT"]);
      expect(actions[0].input).toEqual({ target: "action-0" });
    });

    /** A v3 remote created with `initialGlobal`, then given `content` rows. */
    function remoteCreatedWith(
      initialGlobal: Record<string, unknown>,
      content: { type: string; input: object }[],
      hostGlobal: Record<string, unknown>,
      baseReducer = 3,
    ) {
      const created = documentModelDocumentModelModule.utils.createDocument({
        global: initialGlobal as never,
      });
      const row = (
        index: number,
        action: Omit<RemoteOperation["action"], "context">,
      ) => ({
        index,
        timestampUtcMs: action.timestampUtcMs,
        hash: `hash-${action.scope}-${index}`,
        skip: 0,
        error: null,
        id: `op-${action.scope}-${index}`,
        action: { ...action, context: null },
      });
      const items = [
        ...creationActions(created, { "base-reducer": baseReducer }).map(
          (action, i) => row(i, action as never),
        ),
        ...content.map(({ type, input }, i) =>
          row(i, {
            id: `action-${i}`,
            type,
            input,
            scope: "global",
            timestampUtcMs: new Date(
              Date.UTC(2026, 0, 1, 0, 0, i),
            ).toISOString(),
          }),
        ),
      ];
      const docData = {
        ...makeDocData({
          state: documentModelDocumentModelModule.utils.createState({
            global: hostGlobal as never,
          }),
          revisionsList: [
            { scope: "document", revision: 2 },
            { scope: "global", revision: content.length },
          ],
        }),
        protocolVersions: { "base-reducer": baseReducer },
      };
      return createMockClient({
        GetDocumentWithOperations: vi
          .fn()
          .mockResolvedValue(
            makeDocWithOpsResponse(docData as never, { items: items as never }),
          ),
      });
    }

    it("re-derives an undo from the state the document was created with", async () => {
      const client = remoteCreatedWith(
        { name: "Team" },
        [{ type: "SET_MODEL_DESCRIPTION", input: { description: "d" } }],
        { name: "Team", description: "d" },
      );
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1" },
      );

      controller.undo();

      expect(controller.state.global.name).toBe("Team");
      expect(controller.state.global.description).toBe("");
      await controller.push();
      expect(pushedActions(client)[0].input).toEqual({ target: "action-0" });
    });

    it("undoes below base-reducer 3 from the state the document was created with", async () => {
      const client = remoteCreatedWith(
        { name: "Team" },
        [{ type: "SET_MODEL_DESCRIPTION", input: { description: "d" } }],
        { name: "Team", description: "d" },
        2,
      );
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1" },
      );

      controller.undo();

      expect(controller.state.global.name).toBe("Team");
      expect(controller.state.global.description).toBe("");
    });

    it("resolves the undo target against the state the document was created with", async () => {
      const withModule = (name: string) => {
        const global = structuredClone(
          documentModelDocumentModelModule.utils.createState().global,
        ) as unknown as { specifications: { modules: unknown[] }[] };
        global.specifications[0].modules = [
          { id: "m1", name, description: "", operations: [] },
        ];
        return global;
      };
      const client = remoteCreatedWith(
        withModule("before"),
        [
          { type: "SET_MODEL_DESCRIPTION", input: { description: "d" } },
          { type: "SET_MODULE_NAME", input: { id: "m1", name: "after" } },
        ],
        { ...withModule("after"), description: "d" },
      );
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1" },
      );

      controller.undo();

      expect(controller.state.global.specifications[0].modules[0].name).toBe(
        "before",
      );
      expect(controller.state.global.description).toBe("d");
      await controller.push();
      expect(pushedActions(client)[0].input).toEqual({ target: "action-1" });
    });

    function newDocumentHostAt(baseReducer: number) {
      const client = createMockClient({
        GetCreateProtocolVersions: vi.fn().mockResolvedValue({
          createDefaults: { protocolVersions: { "base-reducer": baseReducer } },
        }),
      });
      vi.mocked(client.GetDocumentWithOperations).mockImplementation(() => {
        const created = createdDocument(client);
        return Promise.resolve(
          makeDocWithOpsResponse({
            ...makeDocData({
              id: created.header.id,
              state: documentModelDocumentModelModule.utils.createState(),
            }),
            protocolVersions: created.header.protocolVersions,
          } as never),
        );
      });
      return client;
    }

    it("heads a new document with the host's versions for its type", async () => {
      const client = newDocumentHostAt(3);
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, parentIdentifier: "drive-1" },
      );

      expect(controller.header.protocolVersions?.["base-reducer"]).toBe(3);
      expect(client.GetCreateProtocolVersions).toHaveBeenCalledWith(
        {
          documentType: "powerhouse/document-model",
          parentIdOrSlug: "drive-1",
        },
        undefined,
        undefined,
      );
    });

    it("undoes a new document before its first push with a signed RETRACT", async () => {
      const client = newDocumentHostAt(3);
      const author = signer();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, signer: author },
      );
      const headed = structuredClone(controller.document.state);

      controller.setModelName({ name: "local" });
      const local = controller.operations.global.at(-1)!.action.id;
      controller.undo();
      expect(controller.state.global.name).toBe("");
      await controller.push();

      expect(client.CreateEmptyDocument).not.toHaveBeenCalled();
      const created = createdDocument(client);
      expect(created.header.protocolVersions?.["base-reducer"]).toBe(3);
      expect(created.operations.global ?? []).toEqual([]);
      expect(created.state).toEqual(headed);
      const actions = pushedActions(client);
      expect(actions.map((action) => action.type)).toEqual([
        "SET_MODEL_NAME",
        "RETRACT",
      ]);
      expect(actions[1].input).toEqual({ target: local });
      expect(actions[1].context!.signer!.user!.address).toBe("0x123");
    });

    it("undoes a new document inside the streaming push delay", async () => {
      const client = newDocumentHostAt(3);
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, mode: "streaming" },
      );

      controller.setModelName({ name: "local" });
      controller.undo();

      await vi.waitFor(() => {
        expect(client.MutateDocument).toHaveBeenCalledTimes(1);
      });
      expect(pushedActions(client).map((action) => action.type)).toEqual([
        "SET_MODEL_NAME",
        "RETRACT",
      ]);
    });

    it("undoes with a RETRACT after the first push", async () => {
      const client = newDocumentHostAt(3);
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client },
      );
      await controller.push();

      expect(controller.header.protocolVersions?.["base-reducer"]).toBe(3);
      controller.setModelName({ name: "local" });
      const local = controller.operations.global.at(-1)!.action.id;
      controller.undo();
      await controller.push();

      const actions = pushedActions(client);
      expect(actions.map((action) => action.type)).toEqual([
        "SET_MODEL_NAME",
        "RETRACT",
      ]);
      expect(actions[1].input).toEqual({ target: local });
    });

    it("creates a wrapped new document under its own header", async () => {
      const client = newDocumentHostAt(3);
      const local = new DocumentModelController();
      const controller = RemoteDocumentController.from(local, { client });

      controller.setModelName({ name: "local" });
      controller.undo();
      await controller.push();

      expect(createdDocument(client).header.protocolVersions).toEqual(
        local.header.protocolVersions,
      );
      expect(client.GetCreateProtocolVersions).not.toHaveBeenCalled();
      expect(pushedActions(client).map((action) => action.type)).toEqual([
        "SET_MODEL_NAME",
        "NOOP",
      ]);
    });

    // Unchanged below base-reducer 3: the local UNDO becomes the NOOP it pushes.
    it("still undoes locally below base-reducer 3", async () => {
      const client = remoteAt(2);
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1" },
      );

      controller.setModelName({ name: "local" });
      controller.undo();

      expect(controller.state.global.name).toBe("remote");
      await controller.push();
      const actions = pushedActions(client);
      expect(actions.map((action) => action.type)).toEqual([
        "SET_MODEL_NAME",
        "NOOP",
      ]);
    });
  });

  describe("new documents", () => {
    /** Apollo's answer to a query on a Switchboard that predates createDefaults (6.2.3). */
    const noCreateDefaults = () =>
      Object.assign(new Error("validation failed"), {
        response: {
          status: 400,
          errors: [
            {
              message: 'Cannot query field "createDefaults" on type "Query".',
              extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
            },
          ],
        },
      });

    it("heads a new document with the host's versions for its type", async () => {
      const client = createMockClient();
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, parentIdentifier: "drive-1" },
      );

      expect(controller.header.protocolVersions).toEqual({
        "base-reducer": 2,
        signature: 2,
      });
      expect(client.GetCreateProtocolVersions).toHaveBeenCalledWith(
        {
          documentType: "powerhouse/document-model",
          parentIdOrSlug: "drive-1",
        },
        undefined,
        undefined,
      );

      const headed = controller.header;
      controller.setName({ name: "New Doc" });
      await controller.push();

      const created = createdDocument(client).header;
      expect(created.id).toBe(headed.id);
      expect(created.protocolVersions).toEqual(headed.protocolVersions);
    });

    it("creates through CreateEmptyDocument on a Switchboard without createDefaults", async () => {
      const client = createMockClient({
        GetCreateDefaults: vi.fn().mockRejectedValue(noCreateDefaults()),
        GetCreateProtocolVersions: vi
          .fn()
          .mockRejectedValue(noCreateDefaults()),
      });
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, parentIdentifier: "drive-1" },
      );

      controller.setName({ name: "New Doc" });
      const result = await controller.push();

      expect(client.CreateEmptyDocument).toHaveBeenCalledExactlyOnceWith({
        documentType: "powerhouse/document-model",
        parentIdentifier: "drive-1",
      });
      expect(client.CreateDocument).not.toHaveBeenCalled();
      expect(result.actionCount).toBe(1);
      expect(controller.status.documentId).toBe("new-doc-1");
    });

    it("passes on any other createDefaults failure", async () => {
      const refused = Object.assign(new Error("forbidden"), {
        response: {
          status: 200,
          errors: [{ message: "Forbidden", extensions: { code: "FORBIDDEN" } }],
        },
      });
      const client = createMockClient({
        GetCreateDefaults: vi.fn().mockRejectedValue(refused),
      });

      await expect(
        RemoteDocumentController.pull(DocumentModelController, { client }),
      ).rejects.toBe(refused);
    });

    it("creates a wrapped new document under its own header", async () => {
      const client = createMockClient();
      const local = new DocumentModelController();
      const controller = RemoteDocumentController.from(local, { client });

      controller.setName({ name: "local" });
      await controller.push();

      expect(createdDocument(client).header.protocolVersions).toEqual(
        local.header.protocolVersions,
      );
      expect(client.GetCreateProtocolVersions).not.toHaveBeenCalled();
    });

    it("pulls the remote header's protocol versions", async () => {
      const client = createMockClient({
        GetDocumentWithOperations: vi.fn().mockResolvedValue(
          makeDocWithOpsResponse({
            ...makeDocData(),
            protocolVersions: { "base-reducer": 1 },
          } as never),
        ),
      });
      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        { client, documentId: "doc-1" },
      );

      expect(controller.header.protocolVersions).toEqual({ "base-reducer": 1 });
    });
  });
});
