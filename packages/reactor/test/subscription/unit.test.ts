import type { PHDocument } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RelationshipChangeType,
  type PagedResults,
  type SearchFilter,
} from "../../src/shared/types.js";
import { DefaultSubscriptionErrorHandler } from "../../src/subs/default-error-handler.js";
import { ReactorSubscriptionManager } from "../../src/subs/react-subscription-manager.js";
import { SubscriptionNotificationReadModel } from "../../src/subs/subscription-notification-read-model.js";
import type {
  ISubscriptionErrorHandler,
  SubscriptionErrorContext,
} from "../../src/subs/types.js";

describe("ReactorSubscriptionManager", () => {
  let manager: ReactorSubscriptionManager;
  let mockErrorHandler: ISubscriptionErrorHandler;

  beforeEach(() => {
    // Use a mock error handler that doesn't throw for most tests
    mockErrorHandler = {
      handleError: vi.fn(),
    };
    manager = new ReactorSubscriptionManager(mockErrorHandler);
  });

  describe("Subscription Methods", () => {
    describe("onDocumentCreated", () => {
      it("should register a subscription and return unsubscribe function", () => {
        const callback = vi.fn();
        const unsubscribe = manager.onDocumentCreated(callback);

        expect(unsubscribe).toBeInstanceOf(Function);

        // Verify subscription works
        manager.notifyDocumentsCreated(["doc1"]);
        expect(callback).toHaveBeenCalledTimes(1);

        // Unsubscribe and verify it no longer receives notifications
        unsubscribe();
        manager.notifyDocumentsCreated(["doc2"]);
        expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
      });

      it("should register multiple subscriptions", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn();

        const unsub1 = manager.onDocumentCreated(callback1);
        const unsub2 = manager.onDocumentCreated(callback2);

        // Both should receive notifications
        manager.notifyDocumentsCreated(["doc1"]);
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);

        // Unsubscribe first callback
        unsub1();
        manager.notifyDocumentsCreated(["doc2"]);
        expect(callback1).toHaveBeenCalledTimes(1); // Still 1
        expect(callback2).toHaveBeenCalledTimes(2); // Now 2

        // Unsubscribe second callback
        unsub2();
        manager.notifyDocumentsCreated(["doc3"]);
        expect(callback1).toHaveBeenCalledTimes(1); // Still 1
        expect(callback2).toHaveBeenCalledTimes(2); // Still 2
      });

      it("should store search filters with subscription", () => {
        const callback = vi.fn();
        const search: SearchFilter = { type: "Document" };

        manager.onDocumentCreated(callback, search);
        manager.notifyDocumentsCreated(
          ["doc1"],
          new Map([["doc1", "Document"]]),
        );

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            results: ["doc1"],
          }),
        );
      });
    });

    describe("onDocumentDeleted", () => {
      it("should register a subscription and return unsubscribe function", () => {
        const callback = vi.fn();
        const unsubscribe = manager.onDocumentDeleted(callback);

        expect(unsubscribe).toBeInstanceOf(Function);

        // Verify subscription works
        manager.notifyDocumentsDeleted(["doc1"]);
        expect(callback).toHaveBeenCalledTimes(1);

        // Unsubscribe and verify it no longer receives notifications
        unsubscribe();
        manager.notifyDocumentsDeleted(["doc2"]);
        expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
      });
    });

    describe("onDocumentStateUpdated", () => {
      it("should register a subscription with view filter", () => {
        const callback = vi.fn();
        const search: SearchFilter = { type: "Document" };
        const view = { branch: "main" };

        const unsubscribe = manager.onDocumentStateUpdated(
          callback,
          search,
          view,
        );

        expect(unsubscribe).toBeInstanceOf(Function);

        // Verify subscription works with matching filter
        const doc: PHDocument = {
          header: {
            id: "doc1",
            documentType: "Document",
            slug: "doc-1",
          },
        } as PHDocument;

        manager.notifyDocumentsUpdated([doc]);
        expect(callback).toHaveBeenCalledTimes(1);

        // Unsubscribe and verify it no longer receives notifications
        unsubscribe();
        manager.notifyDocumentsUpdated([doc]);
        expect(callback).toHaveBeenCalledTimes(1); // Still 1
      });
    });

    describe("onRelationshipChanged", () => {
      it("should register a subscription", () => {
        const callback = vi.fn();
        const unsubscribe = manager.onRelationshipChanged(callback);

        expect(unsubscribe).toBeInstanceOf(Function);

        // Verify subscription works
        manager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
        expect(callback).toHaveBeenCalledTimes(1);

        // Unsubscribe and verify it no longer receives notifications
        unsubscribe();
        manager.notifyRelationshipChanged(
          "parent2",
          "child2",
          RelationshipChangeType.Added,
        );
        expect(callback).toHaveBeenCalledTimes(1); // Still 1
      });
    });
  });

  describe("Notification Methods", () => {
    describe("notifyDocumentsCreated", () => {
      it("should notify all subscribers with created documents", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn();

        manager.onDocumentCreated(callback1);
        manager.onDocumentCreated(callback2);

        const documentIds = ["doc1", "doc2"];
        manager.notifyDocumentsCreated(documentIds);

        expect(callback1).toHaveBeenCalledWith(
          expect.objectContaining({
            results: documentIds,
            options: { cursor: "", limit: 2 },
          }),
        );
        expect(callback2).toHaveBeenCalledWith(
          expect.objectContaining({
            results: documentIds,
            options: { cursor: "", limit: 2 },
          }),
        );
      });

      it("should filter documents by type", () => {
        const callback = vi.fn();
        const search: SearchFilter = { type: "Task" };

        manager.onDocumentCreated(callback, search);

        const documentIds = ["doc1", "doc2", "doc3"];
        const types = new Map([
          ["doc1", "Task"],
          ["doc2", "Document"],
          ["doc3", "Task"],
        ]);

        manager.notifyDocumentsCreated(documentIds, types);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            results: ["doc1", "doc3"],
          }),
        );
      });

      it("should filter documents by parentId", () => {
        const callback = vi.fn();
        const search: SearchFilter = { parentId: "parent1" };

        manager.onDocumentCreated(callback, search);

        const documentIds = ["doc1", "doc2", "doc3"];
        const parentIds = new Map<string, string | null>([
          ["doc1", "parent1"],
          ["doc2", "parent2"],
          ["doc3", "parent1"],
        ]);

        manager.notifyDocumentsCreated(documentIds, undefined, parentIds);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            results: ["doc1", "doc3"],
          }),
        );
      });

      it("should not notify if no documents match filter", () => {
        const callback = vi.fn();
        const search: SearchFilter = { type: "NonExistent" };

        manager.onDocumentCreated(callback, search);

        const documentIds = ["doc1", "doc2"];
        const types = new Map([
          ["doc1", "Task"],
          ["doc2", "Document"],
        ]);

        manager.notifyDocumentsCreated(documentIds, types);

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe("notifyDocumentsDeleted", () => {
      it("should notify subscribers with deleted document IDs", () => {
        const callback = vi.fn();

        manager.onDocumentDeleted(callback);

        const documentIds = ["doc1", "doc2"];
        manager.notifyDocumentsDeleted(documentIds);

        expect(callback).toHaveBeenCalledWith(documentIds);
      });

      it("should filter deleted documents by search criteria", () => {
        const callback = vi.fn();
        const search: SearchFilter = { ids: ["doc1", "doc3"] };

        manager.onDocumentDeleted(callback, search);

        const documentIds = ["doc1", "doc2", "doc3", "doc4"];
        manager.notifyDocumentsDeleted(documentIds);

        expect(callback).toHaveBeenCalledWith(["doc1", "doc3"]);
      });
    });

    describe("notifyDocumentsUpdated", () => {
      it("should notify subscribers with updated documents", () => {
        const callback = vi.fn();

        manager.onDocumentStateUpdated(callback);

        const documents: PHDocument[] = [
          {
            header: {
              id: "doc1",
              documentType: "Task",
              slug: "task-1",
            },
          } as PHDocument,
          {
            header: {
              id: "doc2",
              documentType: "Document",
              slug: "doc-2",
            },
          } as PHDocument,
        ];

        manager.notifyDocumentsUpdated(documents);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            results: documents,
            options: { cursor: "", limit: 2 },
          }),
        );
      });

      it("should filter updated documents by type", () => {
        const callback = vi.fn();
        const search: SearchFilter = { type: "Task" };

        manager.onDocumentStateUpdated(callback, search);

        const documents: PHDocument[] = [
          {
            header: {
              id: "doc1",
              documentType: "Task",
              slug: "task-1",
            },
          } as PHDocument,
          {
            header: {
              id: "doc2",
              documentType: "Document",
              slug: "doc-2",
            },
          } as PHDocument,
        ];

        manager.notifyDocumentsUpdated(documents);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            results: [documents[0]],
          }),
        );
      });

      it("should filter updated documents by slug", () => {
        const callback = vi.fn();
        const search: SearchFilter = { slugs: ["task-1", "task-3"] };

        manager.onDocumentStateUpdated(callback, search);

        const documents: PHDocument[] = [
          {
            header: {
              id: "doc1",
              documentType: "Task",
              slug: "task-1",
            },
          } as PHDocument,
          {
            header: {
              id: "doc2",
              documentType: "Task",
              slug: "task-2",
            },
          } as PHDocument,
          {
            header: {
              id: "doc3",
              documentType: "Task",
              slug: "task-3",
            },
          } as PHDocument,
        ];

        manager.notifyDocumentsUpdated(documents);

        const result = callback.mock.calls[0][0] as PagedResults<PHDocument>;
        expect(result.results).toHaveLength(2);
        expect(result.results[0].header.slug).toBe("task-1");
        expect(result.results[1].header.slug).toBe("task-3");
      });
    });

    describe("notifyRelationshipChanged", () => {
      it("should notify subscribers about relationship changes", () => {
        const callback = vi.fn();

        manager.onRelationshipChanged(callback);

        manager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );

        expect(callback).toHaveBeenCalledWith(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
      });

      it("should filter by parentId", () => {
        const callback = vi.fn();
        const search: SearchFilter = { parentId: "parent1" };

        manager.onRelationshipChanged(callback, search);

        manager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
        manager.notifyRelationshipChanged(
          "parent2",
          "child2",
          RelationshipChangeType.Added,
        );

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
      });

      it("should filter by child document type", () => {
        const callback = vi.fn();
        const search: SearchFilter = { type: "Task" };

        manager.onRelationshipChanged(callback, search);

        manager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
          "Task",
        );
        manager.notifyRelationshipChanged(
          "parent1",
          "child2",
          RelationshipChangeType.Added,
          "Document",
        );

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
      });

      it("should filter by child IDs", () => {
        const callback = vi.fn();
        const search: SearchFilter = { ids: ["child1", "child3"] };

        manager.onRelationshipChanged(callback, search);

        manager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
        manager.notifyRelationshipChanged(
          "parent1",
          "child2",
          RelationshipChangeType.Added,
        );
        manager.notifyRelationshipChanged(
          "parent1",
          "child3",
          RelationshipChangeType.Removed,
        );

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenNthCalledWith(
          1,
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );
        expect(callback).toHaveBeenNthCalledWith(
          2,
          "parent1",
          "child3",
          RelationshipChangeType.Removed,
        );
      });
    });
  });

  describe("Utility Methods", () => {
    describe("clearAll", () => {
      it("should remove all subscriptions", () => {
        const createdCallback = vi.fn();
        const deletedCallback = vi.fn();
        const updatedCallback = vi.fn();
        const relationshipCallback = vi.fn();

        manager.onDocumentCreated(createdCallback);
        manager.onDocumentDeleted(deletedCallback);
        manager.onDocumentStateUpdated(updatedCallback);
        manager.onRelationshipChanged(relationshipCallback);

        // Verify all subscriptions work
        manager.notifyDocumentsCreated(["doc1"]);
        manager.notifyDocumentsDeleted(["doc2"]);
        const doc: PHDocument = {
          header: { id: "doc3", documentType: "Task", slug: "task-3" },
        } as PHDocument;
        manager.notifyDocumentsUpdated([doc]);
        manager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );

        expect(createdCallback).toHaveBeenCalledTimes(1);
        expect(deletedCallback).toHaveBeenCalledTimes(1);
        expect(updatedCallback).toHaveBeenCalledTimes(1);
        expect(relationshipCallback).toHaveBeenCalledTimes(1);

        // Clear all subscriptions
        manager.clearAll();

        // Verify no callbacks are called after clearAll
        manager.notifyDocumentsCreated(["doc4"]);
        manager.notifyDocumentsDeleted(["doc5"]);
        manager.notifyDocumentsUpdated([doc]);
        manager.notifyRelationshipChanged(
          "parent2",
          "child2",
          RelationshipChangeType.Removed,
        );

        // All callbacks should still have been called only once
        expect(createdCallback).toHaveBeenCalledTimes(1);
        expect(deletedCallback).toHaveBeenCalledTimes(1);
        expect(updatedCallback).toHaveBeenCalledTimes(1);
        expect(relationshipCallback).toHaveBeenCalledTimes(1);
      });

      it("should not notify cleared subscriptions", () => {
        const callback = vi.fn();
        manager.onDocumentCreated(callback);

        // Verify subscription works before clear
        manager.notifyDocumentsCreated(["doc1"]);
        expect(callback).toHaveBeenCalledTimes(1);

        // Clear and verify no more notifications
        manager.clearAll();
        manager.notifyDocumentsCreated(["doc2"]);

        expect(callback).toHaveBeenCalledTimes(1); // Still 1
      });
    });
  });

  describe("Complex Filtering Scenarios", () => {
    it("should handle multiple filters in combination", () => {
      const callback = vi.fn();
      const search: SearchFilter = {
        type: "Task",
        parentId: "parent1",
        ids: ["doc1", "doc2", "doc3"],
      };

      manager.onDocumentCreated(callback, search);

      const documentIds = ["doc1", "doc2", "doc3", "doc4"];
      const types = new Map([
        ["doc1", "Task"],
        ["doc2", "Document"],
        ["doc3", "Task"],
        ["doc4", "Task"],
      ]);
      const parentIds = new Map<string, string | null>([
        ["doc1", "parent1"],
        ["doc2", "parent1"],
        ["doc3", "parent2"],
        ["doc4", "parent1"],
      ]);

      manager.notifyDocumentsCreated(documentIds, types, parentIds);

      // Only doc1 matches all criteria: id in list, type=Task, parentId=parent1
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          results: ["doc1"],
        }),
      );
    });

    it("should handle subscriptions with no filters", () => {
      const callback = vi.fn();

      manager.onDocumentCreated(callback);

      const documentIds = ["doc1", "doc2", "doc3"];
      manager.notifyDocumentsCreated(documentIds);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          results: documentIds,
        }),
      );
    });

    it("should handle empty document lists", () => {
      const callback = vi.fn();

      manager.onDocumentCreated(callback);
      manager.notifyDocumentsCreated([]);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle null parent IDs", () => {
      const callback = vi.fn();
      const search: SearchFilter = { parentId: "parent1" };

      manager.onDocumentCreated(callback, search);

      const documentIds = ["doc1", "doc2", "doc3"];
      const parentIds = new Map<string, string | null>([
        ["doc1", "parent1"],
        ["doc2", null],
        ["doc3", "parent1"],
      ]);

      manager.notifyDocumentsCreated(documentIds, undefined, parentIds);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          results: ["doc1", "doc3"],
        }),
      );
    });
  });

  describe("Independent Subscription Management", () => {
    it("should manage subscriptions independently", () => {
      const createdCallback = vi.fn();
      const deletedCallback = vi.fn();
      const updatedCallback = vi.fn();

      manager.onDocumentCreated(createdCallback);
      manager.onDocumentDeleted(deletedCallback);
      manager.onDocumentStateUpdated(updatedCallback);

      // Notify created - should only call created callback
      manager.notifyDocumentsCreated(["doc1"]);
      expect(createdCallback).toHaveBeenCalledTimes(1);
      expect(deletedCallback).not.toHaveBeenCalled();
      expect(updatedCallback).not.toHaveBeenCalled();

      // Notify deleted - should only call deleted callback
      manager.notifyDocumentsDeleted(["doc2"]);
      expect(createdCallback).toHaveBeenCalledTimes(1);
      expect(deletedCallback).toHaveBeenCalledTimes(1);
      expect(updatedCallback).not.toHaveBeenCalled();

      // Notify updated - should only call updated callback
      const doc: PHDocument = {
        header: { id: "doc3", documentType: "Task", slug: "task-3" },
      } as PHDocument;
      manager.notifyDocumentsUpdated([doc]);
      expect(createdCallback).toHaveBeenCalledTimes(1);
      expect(deletedCallback).toHaveBeenCalledTimes(1);
      expect(updatedCallback).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple unsubscribes correctly", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const unsub1 = manager.onDocumentCreated(callback1);
      const unsub2 = manager.onDocumentCreated(callback2);
      const unsub3 = manager.onDocumentCreated(callback3);

      // Unsubscribe middle one
      unsub2();

      manager.notifyDocumentsCreated(["doc1"]);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).toHaveBeenCalled();

      // Unsubscribe remaining
      unsub1();
      unsub3();

      manager.notifyDocumentsCreated(["doc2"]);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(0);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it("should handle double unsubscribe gracefully", () => {
      const callback = vi.fn();
      const unsubscribe = manager.onDocumentCreated(callback);

      // Verify subscription works
      manager.notifyDocumentsCreated(["doc1"]);
      expect(callback).toHaveBeenCalledTimes(1);

      // First unsubscribe
      unsubscribe();
      manager.notifyDocumentsCreated(["doc2"]);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1

      // Second unsubscribe should not cause issues
      unsubscribe();
      manager.notifyDocumentsCreated(["doc3"]);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe("Error Handling and Guaranteed Delivery", () => {
    let errorHandler: ISubscriptionErrorHandler;
    let errorManager: ReactorSubscriptionManager;

    beforeEach(() => {
      errorHandler = {
        handleError: vi.fn(),
      };
      errorManager = new ReactorSubscriptionManager(errorHandler);
    });

    describe("Document Created Events", () => {
      it("should catch errors and continue delivering to other subscribers", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn().mockImplementation(() => {
          throw new Error("Callback 2 error");
        });
        const callback3 = vi.fn();

        errorManager.onDocumentCreated(callback1);
        errorManager.onDocumentCreated(callback2);
        errorManager.onDocumentCreated(callback3);

        errorManager.notifyDocumentsCreated(["doc1"]);

        // All callbacks should be called despite callback2 throwing
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);

        // Error handler should be called for callback2
        expect(errorHandler.handleError).toHaveBeenCalledTimes(1);
        expect(errorHandler.handleError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            eventType: "created",
            subscriptionId: expect.stringContaining("created-") as unknown,
            eventData: ["doc1"],
          }),
        );
      });

      it("should provide error context with filtered data", () => {
        const callback = vi.fn().mockImplementation(() => {
          throw new Error("Test error");
        });

        errorManager.onDocumentCreated(callback, { type: "Task" });

        const documentIds = ["doc1", "doc2"];
        const types = new Map([
          ["doc1", "Task"],
          ["doc2", "Document"],
        ]);

        errorManager.notifyDocumentsCreated(documentIds, types);

        expect(errorHandler.handleError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            eventType: "created",
            eventData: ["doc1"], // Only filtered doc
          }),
        );
      });
    });

    describe("Document Deleted Events", () => {
      it("should catch errors and continue delivering to other subscribers", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn().mockImplementation(() => {
          throw new Error("Delete callback error");
        });
        const callback3 = vi.fn();

        errorManager.onDocumentDeleted(callback1);
        errorManager.onDocumentDeleted(callback2);
        errorManager.onDocumentDeleted(callback3);

        errorManager.notifyDocumentsDeleted(["doc1", "doc2"]);

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);

        expect(errorHandler.handleError).toHaveBeenCalledTimes(1);
        expect(errorHandler.handleError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            eventType: "deleted",
            eventData: ["doc1", "doc2"],
          }),
        );
      });
    });

    describe("Document Updated Events", () => {
      it("should catch errors and continue delivering to other subscribers", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn().mockImplementation(() => {
          throw new Error("Update callback error");
        });
        const callback3 = vi.fn();

        errorManager.onDocumentStateUpdated(callback1);
        errorManager.onDocumentStateUpdated(callback2);
        errorManager.onDocumentStateUpdated(callback3);

        const doc: PHDocument = {
          header: {
            id: "doc1",
            documentType: "Task",
            slug: "task-1",
          },
        } as PHDocument;

        errorManager.notifyDocumentsUpdated([doc]);

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);

        expect(errorHandler.handleError).toHaveBeenCalledTimes(1);
        expect(errorHandler.handleError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            eventType: "updated",
            eventData: [doc],
          }),
        );
      });
    });

    describe("Relationship Changed Events", () => {
      it("should catch errors and continue delivering to other subscribers", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn().mockImplementation(() => {
          throw new Error("Relationship callback error");
        });
        const callback3 = vi.fn();

        errorManager.onRelationshipChanged(callback1);
        errorManager.onRelationshipChanged(callback2);
        errorManager.onRelationshipChanged(callback3);

        errorManager.notifyRelationshipChanged(
          "parent1",
          "child1",
          RelationshipChangeType.Added,
        );

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);

        expect(errorHandler.handleError).toHaveBeenCalledTimes(1);
        expect(errorHandler.handleError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            eventType: "relationshipChanged",
            eventData: {
              parentId: "parent1",
              childId: "child1",
              changeType: RelationshipChangeType.Added,
            },
          }),
        );
      });
    });

    describe("Multiple Errors", () => {
      it("should handle multiple errors in the same notification", () => {
        const callback1 = vi.fn().mockImplementation(() => {
          throw new Error("Error 1");
        });
        const callback2 = vi.fn();
        const callback3 = vi.fn().mockImplementation(() => {
          throw new Error("Error 3");
        });

        errorManager.onDocumentCreated(callback1);
        errorManager.onDocumentCreated(callback2);
        errorManager.onDocumentCreated(callback3);

        errorManager.notifyDocumentsCreated(["doc1"]);

        // All callbacks should be called
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);

        // Error handler should be called twice
        expect(errorHandler.handleError).toHaveBeenCalledTimes(2);
      });

      it("should handle errors across different event types", () => {
        const createdCallback = vi.fn().mockImplementation(() => {
          throw new Error("Created error");
        });
        const deletedCallback = vi.fn().mockImplementation(() => {
          throw new Error("Deleted error");
        });

        errorManager.onDocumentCreated(createdCallback);
        errorManager.onDocumentDeleted(deletedCallback);

        errorManager.notifyDocumentsCreated(["doc1"]);
        errorManager.notifyDocumentsDeleted(["doc2"]);

        expect(errorHandler.handleError).toHaveBeenCalledTimes(2);
        expect(errorHandler.handleError).toHaveBeenNthCalledWith(
          1,
          expect.any(Error),
          expect.objectContaining({ eventType: "created" }),
        );
        expect(errorHandler.handleError).toHaveBeenNthCalledWith(
          2,
          expect.any(Error),
          expect.objectContaining({ eventType: "deleted" }),
        );
      });
    });

    describe("Default Error Handler", () => {
      it("should throw enhanced errors with context", () => {
        const throwingHandler = new DefaultSubscriptionErrorHandler();
        const throwingManager = new ReactorSubscriptionManager(throwingHandler);

        const callback = vi.fn().mockImplementation(() => {
          throw new Error("Test error");
        });

        throwingManager.onDocumentCreated(callback);

        // The notification should throw because the default handler re-throws
        expect(() => {
          throwingManager.notifyDocumentsCreated(["doc1"]);
        }).toThrow("Subscription error in created");
      });

      it("should handle non-Error objects in default handler", () => {
        const throwingHandler = new DefaultSubscriptionErrorHandler();
        const throwingManager = new ReactorSubscriptionManager(throwingHandler);

        const callback = vi.fn().mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "string error"; // Throwing a non-Error object to test handling
        });

        throwingManager.onDocumentCreated(callback);

        expect(() => {
          throwingManager.notifyDocumentsCreated(["doc1"]);
        }).toThrow("Subscription error in created");
      });
    });

    describe("Error Handler receives correct subscription IDs", () => {
      it("should pass unique subscription IDs to error handler", () => {
        const callback1 = vi.fn().mockImplementation(() => {
          throw new Error("Error 1");
        });
        const callback2 = vi.fn().mockImplementation(() => {
          throw new Error("Error 2");
        });

        errorManager.onDocumentCreated(callback1);
        errorManager.onDocumentCreated(callback2);

        errorManager.notifyDocumentsCreated(["doc1"]);

        expect(errorHandler.handleError).toHaveBeenCalledTimes(2);

        const mockHandleError = vi.mocked(errorHandler.handleError);
        const calls = mockHandleError.mock.calls;
        const context1 = calls[0][1] as SubscriptionErrorContext;
        const context2 = calls[1][1] as SubscriptionErrorContext;

        expect(context1.subscriptionId).not.toBe(context2.subscriptionId);
        expect(context1.subscriptionId).toContain("created-");
        expect(context2.subscriptionId).toContain("created-");
      });
    });
  });
});

describe("SubscriptionNotificationReadModel", () => {
  it("should call notifyDocumentsUpdated for update operations", async () => {
    const mockSubscriptionManager = {
      notifyDocumentsUpdated: vi.fn(),
      notifyDocumentsCreated: vi.fn(),
      notifyDocumentsDeleted: vi.fn(),
      notifyRelationshipChanged: vi.fn(),
    } as unknown as ReactorSubscriptionManager;

    const mockDocumentView = {
      get: vi.fn().mockResolvedValue({
        header: { id: "doc1", documentType: "MyDocument" },
        state: { updated: true },
      }),
    };

    const readModel = new SubscriptionNotificationReadModel(
      mockSubscriptionManager,
      mockDocumentView as never,
    );

    const operations = [
      {
        operation: {
          index: 1,
          skip: 0,
          hash: "hash1",
          timestampUtcMs: "2024-01-01T00:00:00.000Z",
          action: {
            id: "action1",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "updated" },
          },
          id: "op1",
          resultingState: JSON.stringify({ state: "updated" }),
        },
        context: {
          documentId: "doc1",
          documentType: "MyDocument",
          scope: "global",
          branch: "main",
          ordinal: 2,
        },
      },
    ];

    await readModel.indexOperations(operations);

    expect(mockSubscriptionManager.notifyDocumentsUpdated).toHaveBeenCalled();
  });

  it("should not call notifyDocumentsUpdated for CREATE_DOCUMENT operations", async () => {
    const mockSubscriptionManager = {
      notifyDocumentsUpdated: vi.fn(),
      notifyDocumentsCreated: vi.fn(),
      notifyDocumentsDeleted: vi.fn(),
      notifyRelationshipChanged: vi.fn(),
    } as unknown as ReactorSubscriptionManager;

    const mockDocumentView = {
      get: vi.fn().mockResolvedValue({
        header: { id: "doc1", documentType: "MyDocument" },
        state: { initial: true },
      }),
    };

    const readModel = new SubscriptionNotificationReadModel(
      mockSubscriptionManager,
      mockDocumentView as never,
    );

    const operations = [
      {
        operation: {
          index: 0,
          skip: 0,
          hash: "hash1",
          timestampUtcMs: "2024-01-01T00:00:00.000Z",
          action: {
            id: "action1",
            type: "CREATE_DOCUMENT",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
          id: "op1",
          resultingState: JSON.stringify({ state: "initial" }),
        },
        context: {
          documentId: "doc1",
          documentType: "MyDocument",
          scope: "global",
          branch: "main",
          ordinal: 1,
        },
      },
    ];

    await readModel.indexOperations(operations);

    expect(mockSubscriptionManager.notifyDocumentsCreated).toHaveBeenCalled();
    expect(
      mockSubscriptionManager.notifyDocumentsUpdated,
    ).not.toHaveBeenCalled();
  });

  it("should not call notifyDocumentsUpdated for documents created in the same batch", async () => {
    const mockSubscriptionManager = {
      notifyDocumentsUpdated: vi.fn(),
      notifyDocumentsCreated: vi.fn(),
      notifyDocumentsDeleted: vi.fn(),
      notifyRelationshipChanged: vi.fn(),
    } as unknown as ReactorSubscriptionManager;

    const mockDocumentView = {
      get: vi.fn().mockResolvedValue({
        header: { id: "doc1", documentType: "MyDocument" },
        state: { updated: true },
      }),
    };

    const readModel = new SubscriptionNotificationReadModel(
      mockSubscriptionManager,
      mockDocumentView as never,
    );

    const operations = [
      {
        operation: {
          index: 0,
          skip: 0,
          hash: "hash1",
          timestampUtcMs: "2024-01-01T00:00:00.000Z",
          action: {
            id: "action1",
            type: "CREATE_DOCUMENT",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: {},
          },
          id: "op1",
          resultingState: JSON.stringify({ state: "initial" }),
        },
        context: {
          documentId: "doc1",
          documentType: "MyDocument",
          scope: "global",
          branch: "main",
          ordinal: 1,
        },
      },
      {
        operation: {
          index: 1,
          skip: 0,
          hash: "hash2",
          timestampUtcMs: "2024-01-01T00:00:01.000Z",
          action: {
            id: "action2",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
            input: { name: "updated" },
          },
          id: "op2",
          resultingState: JSON.stringify({ state: "updated" }),
        },
        context: {
          documentId: "doc1",
          documentType: "MyDocument",
          scope: "global",
          branch: "main",
          ordinal: 2,
        },
      },
    ];

    await readModel.indexOperations(operations);

    expect(mockSubscriptionManager.notifyDocumentsCreated).toHaveBeenCalled();
    expect(
      mockSubscriptionManager.notifyDocumentsUpdated,
    ).not.toHaveBeenCalled();
  });

  it("should deduplicate multiple updates to the same document", async () => {
    const mockSubscriptionManager = {
      notifyDocumentsUpdated: vi.fn(),
      notifyDocumentsCreated: vi.fn(),
      notifyDocumentsDeleted: vi.fn(),
      notifyRelationshipChanged: vi.fn(),
    } as unknown as ReactorSubscriptionManager;

    const mockDocumentView = {
      get: vi.fn().mockResolvedValue({
        header: { id: "doc1", documentType: "MyDocument" },
        state: { state2: true },
      }),
    };

    const readModel = new SubscriptionNotificationReadModel(
      mockSubscriptionManager,
      mockDocumentView as never,
    );

    const operations = [
      {
        operation: {
          index: 1,
          skip: 0,
          hash: "hash1",
          timestampUtcMs: "2024-01-01T00:00:00.000Z",
          action: {
            id: "action1",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "name1" },
          },
          id: "op1",
          resultingState: JSON.stringify({ state: "state1" }),
        },
        context: {
          documentId: "doc1",
          documentType: "MyDocument",
          scope: "global",
          branch: "main",
          ordinal: 2,
        },
      },
      {
        operation: {
          index: 2,
          skip: 0,
          hash: "hash2",
          timestampUtcMs: "2024-01-01T00:00:01.000Z",
          action: {
            id: "action2",
            type: "SET_NAME",
            scope: "global",
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
            input: { name: "name2" },
          },
          id: "op2",
          resultingState: JSON.stringify({ state: "state2" }),
        },
        context: {
          documentId: "doc1",
          documentType: "MyDocument",
          scope: "global",
          branch: "main",
          ordinal: 3,
        },
      },
    ];

    await readModel.indexOperations(operations);

    expect(
      mockSubscriptionManager.notifyDocumentsUpdated,
    ).toHaveBeenCalledTimes(1);
  });
});
