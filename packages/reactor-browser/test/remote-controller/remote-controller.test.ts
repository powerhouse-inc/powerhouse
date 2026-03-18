import { DocumentModelController } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { RemoteDocumentController } from "../../src/remote-controller/remote-controller.js";
import type {
  ReactorGraphQLClient,
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
          totalCount: operations.items.length,
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
  overrides: Partial<ReactorGraphQLClient> = {},
): ReactorGraphQLClient {
  const defaultDoc = makeDocData();

  // Build GetDocumentWithOperations from GetDocument if not explicitly set
  const getDocWithOps =
    overrides.GetDocumentWithOperations ??
    vi.fn().mockResolvedValue(makeDocWithOpsResponse(defaultDoc));

  return {
    GetDocument: vi.fn().mockResolvedValue({
      document: {
        document: defaultDoc,
        childIds: [],
      },
    }),
    GetDocumentWithOperations: getDocWithOps,
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
      mutateDocument: makeDocData({
        revisionsList: [{ scope: "global", revision: 1 }],
      }),
    }),
    CreateDocument: vi.fn().mockResolvedValue({
      createDocument: makeDocData(),
    }),
    CreateEmptyDocument: vi.fn().mockResolvedValue({
      createEmptyDocument: makeDocData({ id: "new-doc-1" }),
    }),
    DeleteDocument: vi.fn().mockResolvedValue({
      deleteDocument: true,
    }),
    ...overrides,
  };
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

      // Should have created the document first
      expect(client.CreateEmptyDocument).toHaveBeenCalledTimes(1);
      // Then pushed actions
      expect(client.MutateDocument).toHaveBeenCalledTimes(1);
      expect(result.actionCount).toBe(1);
      // documentId should be updated
      expect(controller.status.documentId).toBe("new-doc-1");
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

      const mutateCall = vi.mocked(client.MutateDocument).mock.calls[0][0];
      const actions = mutateCall.actions as Array<{
        context?: { prevOpHash?: string; prevOpIndex?: number };
      }>;

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

      // GetDocumentWithOperations is called on initial pull + after push
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(2);
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
      const actions = mutateCall.actions as Array<{
        context?: {
          signer?: {
            user: { address: string };
            app: { name: string };
            signatures: unknown[];
          };
        };
      }>;
      expect(actions[0].context!.signer).toBeDefined();
      expect(actions[0].context!.signer!.user.address).toBe("0x123");
      expect(actions[0].context!.signer!.app.name).toBe("test-app");
      expect(actions[0].context!.signer!.signatures).toHaveLength(1);
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
                  attachments: null,
                  context: null,
                },
              },
            ],
            totalCount: 1,
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
      // GetDocumentWithOperations called only for initial pull + post-push pull
      // (no extra call for conflict detection since onConflict is not set)
      expect(client.GetDocumentWithOperations).toHaveBeenCalledTimes(2);
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

  describe("cursor-based incremental fetch", () => {
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
        attachments: null,
        context: null,
      },
    });

    it("uses cursor from first pull on subsequent pulls", async () => {
      const getDocWithOps = vi
        .fn<ReactorGraphQLClient["GetDocumentWithOperations"]>()
        .mockResolvedValue(
          makeDocWithOpsResponse(makeDocData(), {
            items: [],
            cursor: "cursor-after-first-pull",
          }),
        );

      const client = createMockClient({
        GetDocumentWithOperations: getDocWithOps,
      });

      const controller = await RemoteDocumentController.pull(
        DocumentModelController,
        {
          client,
          documentId: "doc-1",
          mode: "batch",
        },
      );

      // First pull: no cursor passed (operationsPaging.cursor is null)
      expect(getDocWithOps).toHaveBeenCalledTimes(1);
      expect(
        getDocWithOps.mock.calls[0][0].operationsPaging?.cursor,
      ).toBeNull();

      // Second pull: should use stored cursor
      await controller.pull();
      expect(getDocWithOps).toHaveBeenCalledTimes(2);
      expect(getDocWithOps.mock.calls[1][0].operationsPaging?.cursor).toBe(
        "cursor-after-first-pull",
      );
    });

    it("merges new operations with existing ones on incremental pull", async () => {
      let pullCount = 0;
      const getDocWithOps = vi
        .fn<ReactorGraphQLClient["GetDocumentWithOperations"]>()
        .mockImplementation(() => {
          pullCount++;
          if (pullCount === 1) {
            // First pull: return doc with 2 operations
            return Promise.resolve(
              makeDocWithOpsResponse(
                makeDocData({
                  revisionsList: [{ scope: "global", revision: 2 }],
                }),
                { items: [makeOp(0), makeOp(1)], cursor: "cursor-1" },
              ),
            );
          }
          // Second pull (incremental): return 1 new operation
          return Promise.resolve(
            makeDocWithOpsResponse(
              makeDocData({
                revisionsList: [{ scope: "global", revision: 3 }],
              }),
              { items: [makeOp(2)], cursor: "cursor-2" },
            ),
          );
        });

      const client = createMockClient({
        GetDocumentWithOperations: getDocWithOps,
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
      expect(getDocWithOps).toHaveBeenCalledTimes(2);
      // Second call used the cursor
      expect(getDocWithOps.mock.calls[1][0].operationsPaging?.cursor).toBe(
        "cursor-1",
      );
    });

    it("falls back to full fetch when cursor is stale", async () => {
      let pullCount = 0;
      const getDocWithOps = vi
        .fn<ReactorGraphQLClient["GetDocumentWithOperations"]>()
        .mockImplementation(() => {
          pullCount++;
          if (pullCount === 1) {
            // First pull: return doc with 1 operation
            return Promise.resolve(
              makeDocWithOpsResponse(
                makeDocData({
                  revisionsList: [{ scope: "global", revision: 1 }],
                }),
                { items: [makeOp(0)], cursor: "stale-cursor" },
              ),
            );
          }
          // Second pull (incremental): cursor is stale, returns 0 new items
          // Remote says revision is 3, so 1 existing + 0 new = 1 != 3
          return Promise.resolve(
            makeDocWithOpsResponse(
              makeDocData({
                revisionsList: [{ scope: "global", revision: 3 }],
              }),
              { items: [], cursor: null },
            ),
          );
        });

      // Fallback full fetch via GetDocumentOperations
      const getDocOps = vi
        .fn<ReactorGraphQLClient["GetDocumentOperations"]>()
        .mockResolvedValue({
          documentOperations: {
            items: [makeOp(0), makeOp(1), makeOp(2)],
            totalCount: 3,
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: "fresh-cursor",
          },
        });

      const client = createMockClient({
        GetDocumentWithOperations: getDocWithOps,
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

      // Second pull: incremental fetch fails validation, falls back to full
      await controller.pull();

      expect(controller.operations["global"]).toHaveLength(3);
      // GetDocumentWithOperations called twice (first pull + stale incremental)
      expect(getDocWithOps).toHaveBeenCalledTimes(2);
      // Fallback uses GetDocumentOperations without cursor
      expect(getDocOps).toHaveBeenCalledTimes(1);
      expect(getDocOps.mock.calls[0][0].paging?.cursor).toBeNull();
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
        GetDocumentWithOperations: vi
          .fn()
          .mockResolvedValueOnce(makeDocWithOpsResponse(makeDocData()))
          // Post-push pull fails
          .mockRejectedValue(new Error("Pull failed")),
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

    it("restores actions when CreateEmptyDocument fails for new docs", async () => {
      const client = createMockClient({
        CreateEmptyDocument: vi
          .fn()
          .mockRejectedValue(new Error("Create failed")),
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
});
