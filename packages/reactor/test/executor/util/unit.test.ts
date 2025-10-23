import type {
  CreateDocumentAction,
  DocumentModelPHState,
} from "document-model";
import { describe, expect, it } from "vitest";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  createDocumentFromAction,
} from "../../../src/executor/util.js";

describe("createDocumentFromAction", () => {
  it("should create a document with minimal input", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.header.id).toBe("doc-123");
    expect(document.header.documentType).toBe("powerhouse/document-model");
    expect(document.header.slug).toBe("doc-123");
    expect(document.operations).toEqual({});
    expect(document.clipboard).toEqual([]);
    expect(document.state).toBeDefined();
    expect(document.initialState).toBeDefined();
  });

  it("should populate signing information when provided", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        signing: {
          publicKey: { kty: "test" },
          nonce: "12345",
          createdAtUtcIso: "2024-01-01T00:00:00.000Z",
        },
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.header.sig).toEqual({
      publicKey: { kty: "test" },
      nonce: "12345",
    });
    expect(document.header.createdAtUtcIso).toBe("2024-01-01T00:00:00.000Z");
    expect(document.header.lastModifiedAtUtcIso).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("should populate all optional header fields", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        slug: "my-custom-slug",
        name: "My Document",
        branch: "feature-branch",
        meta: {
          customField: "customValue",
        },
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.header.slug).toBe("my-custom-slug");
    expect(document.header.name).toBe("My Document");
    expect(document.header.branch).toBe("feature-branch");
    expect(document.header.meta).toEqual({
      customField: "customValue",
    });
  });

  it("should default slug to documentId when slug is undefined", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-456",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.header.slug).toBe("doc-456");
  });

  it("should default slug to documentId when slug is empty string", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-789",
        model: "powerhouse/document-model",
        slug: "",
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.header.slug).toBe("doc-789");
  });

  it("should initialize document with default base state", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.state).toBeDefined();
    expect(document.initialState).toBeDefined();
    expect(document.state).toEqual(document.initialState);
    expect(document.state.document).toBeDefined();
  });

  it("should initialize operations as empty object", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.operations).toEqual({});
    expect(Object.keys(document.operations).length).toBe(0);
  });

  it("should initialize clipboard as empty array", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction;

    const document = createDocumentFromAction(action);

    expect(document.clipboard).toEqual([]);
    expect(document.clipboard.length).toBe(0);
  });

  it("should create independent document instances", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction;

    const document1 = createDocumentFromAction(action);
    const document2 = createDocumentFromAction(action);

    expect(document1).not.toBe(document2);
    expect(document1.header).not.toBe(document2.header);
    expect(document1.state).not.toBe(document2.state);
  });
});

describe("applyUpgradeDocumentAction", () => {
  it("should merge initialState with existing document state", () => {
    const document = createDocumentFromAction({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction);

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        initialState: {
          global: { nodes: [] },
          local: { selectedNode: null },
        },
      },
    };

    applyUpgradeDocumentAction(document, upgradeAction as never);

    const documentModelState = document.state as DocumentModelPHState;

    expect(documentModelState.global).toEqual({ nodes: [] });
    expect(documentModelState.local).toEqual({ selectedNode: null });
    expect(document.initialState).toEqual(document.state);
  });

  it("should handle state field instead of initialState", () => {
    const document = createDocumentFromAction({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction);

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        state: {
          global: { items: [] },
        },
      },
    };

    applyUpgradeDocumentAction(document, upgradeAction as never);

    expect((document.state as any).global).toEqual({ items: [] });
  });

  it("should preserve existing state when no initialState or state provided", () => {
    const document = createDocumentFromAction({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction);

    const originalState = { ...document.state };

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {},
    };

    applyUpgradeDocumentAction(document, upgradeAction as never);

    expect(document.state).toEqual(originalState);
  });
});

describe("applyDeleteDocumentAction", () => {
  it("should mark document as deleted", () => {
    const document = createDocumentFromAction({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction);

    const deleteAction = {
      id: "delete-1",
      type: "DELETE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:02.000Z",
      input: {
        documentId: "doc-123",
      },
    };

    applyDeleteDocumentAction(document, deleteAction as never);

    expect(document.state.document.isDeleted).toBe(true);
    expect(document.state.document.deletedAtUtcIso).toBe(
      "2024-01-01T00:00:02.000Z",
    );
  });

  it("should use current time if timestampUtcMs not provided", () => {
    const document = createDocumentFromAction({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction);

    const deleteAction = {
      id: "delete-1",
      type: "DELETE_DOCUMENT",
      scope: "document",
      input: {
        documentId: "doc-123",
      },
    };

    const beforeDelete = Date.now();
    applyDeleteDocumentAction(document, deleteAction as never);
    const afterDelete = Date.now();

    expect(document.state.document.isDeleted).toBe(true);
    expect(document.state.document.deletedAtUtcIso).toBeDefined();

    const deletedTime = new Date(
      document.state.document.deletedAtUtcIso as string,
    ).getTime();
    expect(deletedTime).toBeGreaterThanOrEqual(beforeDelete);
    expect(deletedTime).toBeLessThanOrEqual(afterDelete);
  });

  it("should preserve other document state fields", () => {
    const document = createDocumentFromAction({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
      },
    } as CreateDocumentAction);

    const originalVersion = document.state.document.version;

    const deleteAction = {
      id: "delete-1",
      type: "DELETE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:02.000Z",
      input: {
        documentId: "doc-123",
      },
    };

    applyDeleteDocumentAction(document, deleteAction as never);

    expect(document.state.document.version).toBe(originalVersion);
    expect(document.state.auth).toBeDefined();
  });
});
