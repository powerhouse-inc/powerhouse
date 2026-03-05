/* eslint-disable @typescript-eslint/unbound-method */
import { DocumentModelController } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { RemoteDocumentController } from "../../src/remote-controller/remote-controller.js";
import type { ReactorGraphQLClient } from "../../src/remote-controller/types.js";
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

/** Create a mock GraphQL client. */
function createMockClient(
  overrides: Partial<ReactorGraphQLClient> = {},
): ReactorGraphQLClient {
  return {
    GetDocument: vi.fn().mockResolvedValue({
      document: {
        document: makeDocData(),
        childIds: [],
      },
    }),
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
      expect(client.GetDocument).toHaveBeenCalledTimes(1);
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

      // GetDocument is called on initial pull + after push
      expect(client.GetDocument).toHaveBeenCalledTimes(2);
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
        GetDocument: vi.fn().mockResolvedValue({
          document: {
            document: makeDocData({ name: "Remote Name" }),
            childIds: [],
          },
        }),
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
        GetDocument: vi.fn().mockResolvedValue({
          document: {
            document: makeDocData({
              revisionsList: [
                { scope: "global", revision: 5 },
                { scope: "local", revision: 3 },
              ],
            }),
            childIds: [],
          },
        }),
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
      // Initial pull sees revision 1
      const getDocumentFn = vi
        .fn()
        .mockResolvedValueOnce({
          document: {
            document: makeDocData({
              revisionsList: [{ scope: "global", revision: 1 }],
            }),
            childIds: [],
          },
        })
        // Conflict check during push sees revision 2 (remote advanced)
        .mockResolvedValueOnce({
          document: {
            document: makeDocData({
              revisionsList: [{ scope: "global", revision: 2 }],
            }),
            childIds: [],
          },
        })
        // Post-push pull
        .mockResolvedValue({
          document: {
            document: makeDocData({
              revisionsList: [{ scope: "global", revision: 3 }],
            }),
            childIds: [],
          },
        });

      return createMockClient({
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
        GetDocument: vi.fn().mockResolvedValue({
          document: {
            document: makeDocData({
              revisionsList: [{ scope: "global", revision: 1 }],
            }),
            childIds: [],
          },
        }),
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
      // GetDocument called only for initial pull + post-push pull (no conflict check)
      expect(client.GetDocument).toHaveBeenCalledTimes(2);
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
      let callCount = 0;
      const client = createMockClient({
        GetDocument: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Initial pull succeeds
            return Promise.resolve({
              document: {
                document: makeDocData(),
                childIds: [],
              },
            });
          }
          // Post-push pull fails
          return Promise.reject(new Error("Pull failed"));
        }),
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
