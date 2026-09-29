import type {
  Operation,
  OperationWithContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import type { PurgeMarkerContext } from "../../src/events/types.js";
import {
  DocumentNotFoundError,
  DocumentPurgedError,
} from "../../src/shared/errors.js";
import type { IDocumentView } from "../../src/storage/interfaces.js";
import type { ReactorSubscriptionManager } from "../../src/subs/react-subscription-manager.js";
import { SubscriptionNotificationReadModel } from "../../src/subs/subscription-notification-read-model.js";
import { purgeMarker } from "../purge/helpers.js";

const TYPE = "powerhouse/document-model";

function managerMock() {
  return {
    notifyDocumentsUpdated: vi.fn(),
    notifyDocumentsCreated: vi.fn(),
    notifyDocumentsDeleted: vi.fn(),
    notifyRelationshipChanged: vi.fn(),
  };
}

function viewOf(missing: Set<string> = new Set()) {
  return {
    get: vi.fn((id: string) =>
      missing.has(id)
        ? Promise.reject(new DocumentPurgedError(id))
        : Promise.resolve({ header: { id, documentType: TYPE } } as PHDocument),
    ),
  };
}

function markerItem(
  documentId: string,
  ordinal: number,
  appliedDeletion: boolean,
): OperationWithContext {
  const context: PurgeMarkerContext = {
    documentId,
    documentType: TYPE,
    scope: "document",
    branch: "main",
    ordinal,
    ...(appliedDeletion ? { appliedDeletion: true } : {}),
  };
  return { operation: purgeMarker(documentId), context };
}

function updateItem(documentId: string, ordinal: number): OperationWithContext {
  const operation: Operation = {
    id: `op-${ordinal}`,
    index: ordinal,
    skip: 0,
    hash: `hash-${ordinal}`,
    timestampUtcMs: "2026-09-29T00:00:00.000Z",
    action: {
      id: `action-${ordinal}`,
      type: "SET_MODEL_NAME",
      scope: "global",
      timestampUtcMs: "2026-09-29T00:00:00.000Z",
      input: { name: "renamed" },
    },
  };
  return {
    operation,
    context: {
      documentId,
      documentType: TYPE,
      scope: "global",
      branch: "main",
      ordinal,
    },
  };
}

function model(view = viewOf()) {
  const manager = managerMock();
  const readModel = new SubscriptionNotificationReadModel(
    manager as unknown as ReactorSubscriptionManager,
    view as unknown as IDocumentView,
  );
  return { manager, readModel, view };
}

describe("SubscriptionNotificationReadModel on PURGE_DOCUMENT", () => {
  it("emits Deleted for a marker that applied a deletion, without reading the view", async () => {
    const { manager, readModel, view } = model(viewOf(new Set(["doc-a"])));

    await readModel.indexOperations([markerItem("doc-a", 5, true)]);

    expect(manager.notifyDocumentsDeleted).toHaveBeenCalledTimes(1);
    expect(manager.notifyDocumentsDeleted).toHaveBeenCalledWith(
      ["doc-a"],
      new Map([["doc-a", TYPE]]),
      new Map(),
    );
    expect(view.get).not.toHaveBeenCalled();
    expect(manager.notifyDocumentsUpdated).not.toHaveBeenCalled();
  });

  it("emits nothing for a marker on an already-deleted document", async () => {
    const { manager, readModel, view } = model(viewOf(new Set(["doc-a"])));

    await readModel.indexOperations([markerItem("doc-a", 5, false)]);

    expect(manager.notifyDocumentsDeleted).not.toHaveBeenCalled();
    expect(manager.notifyDocumentsUpdated).not.toHaveBeenCalled();
    expect(manager.notifyDocumentsCreated).not.toHaveBeenCalled();
    expect(view.get).not.toHaveBeenCalled();
  });

  it("loses no other notification in a batch with a marker", async () => {
    const { manager, readModel, view } = model(viewOf(new Set(["doc-a"])));

    await readModel.indexOperations([
      updateItem("doc-a", 3),
      updateItem("doc-b", 4),
      markerItem("doc-a", 5, true),
      updateItem("doc-c", 6),
    ]);

    expect(manager.notifyDocumentsDeleted).toHaveBeenCalledWith(
      ["doc-a"],
      expect.any(Map),
      expect.any(Map),
    );
    expect(view.get.mock.calls.map(([id]) => id).sort()).toEqual([
      "doc-b",
      "doc-c",
    ]);
    expect(manager.notifyDocumentsUpdated).toHaveBeenCalledTimes(1);
    const [documents] = manager.notifyDocumentsUpdated.mock.calls[0] as [
      PHDocument[],
    ];
    expect(documents.map((document) => document.header.id).sort()).toEqual([
      "doc-b",
      "doc-c",
    ]);
  });

  it("still notifies the rest when one updated document is gone from the view", async () => {
    const { manager, readModel } = model(viewOf(new Set(["doc-gone"])));

    await readModel.indexOperations([
      updateItem("doc-gone", 1),
      updateItem("doc-b", 2),
    ]);

    const [documents] = manager.notifyDocumentsUpdated.mock.calls[0] as [
      PHDocument[],
    ];
    expect(documents.map((document) => document.header.id)).toEqual(["doc-b"]);
  });

  it("rejects the batch for a view failure other than not found", async () => {
    const view = {
      get: vi.fn(() => Promise.reject(new Error("connection lost"))),
    };
    const { manager, readModel } = model(view as never);

    await expect(
      readModel.indexOperations([updateItem("doc-b", 1)]),
    ).rejects.toThrow("connection lost");
    expect(manager.notifyDocumentsUpdated).not.toHaveBeenCalled();
  });

  it("treats a plain DocumentNotFoundError like a purged one", async () => {
    const view = {
      get: vi.fn((id: string) =>
        id === "doc-gone"
          ? Promise.reject(new DocumentNotFoundError(id))
          : Promise.resolve({ header: { id } } as PHDocument),
      ),
    };
    const { manager, readModel } = model(view as never);

    await readModel.indexOperations([
      updateItem("doc-gone", 1),
      updateItem("doc-b", 2),
    ]);

    expect(manager.notifyDocumentsUpdated).toHaveBeenCalledTimes(1);
  });
});
