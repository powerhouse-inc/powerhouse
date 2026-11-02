import type {
  CreateDocumentAction,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import { documentFromCreation } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
} from "../../../src/executor/util.js";

describe("applyUpgradeDocumentAction", () => {
  it("should merge initialState with existing document state (initial upgrade)", () => {
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction);

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        fromVersion: 0,
        toVersion: 1,
        initialState: {
          global: { nodes: [] },
          local: { selectedNode: null },
        },
      },
    };

    const result = applyUpgradeDocumentAction(document, upgradeAction as never);

    expect(result).not.toBeNull();
    const documentModelState = result!.state as DocumentModelPHState;

    expect(documentModelState.global).toEqual({ nodes: [] });
    expect(documentModelState.local).toEqual({ selectedNode: null });
    expect(result!.initialState).toEqual(result!.state);
    expect(result!.state.document.version).toBe(1);
  });

  it("should handle state field instead of initialState", () => {
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction);

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        fromVersion: 0,
        toVersion: 1,
        state: {
          global: { items: [] },
        },
      },
    };

    const result = applyUpgradeDocumentAction(document, upgradeAction as never);

    expect(result).not.toBeNull();
    expect((result!.state as DocumentModelPHState).global).toEqual({
      items: [],
    });
    expect(result!.state.document.version).toBe(1);
  });

  it("should preserve existing state when no initialState or state provided", () => {
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction);

    const originalState = { ...document.state };

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        fromVersion: 0,
        toVersion: 1,
      },
    };

    const result = applyUpgradeDocumentAction(document, upgradeAction as never);

    expect(result).not.toBeNull();
    expect(result!.state.document.version).toBe(1);

    const expectedState = {
      ...originalState,
      document: { ...originalState.document, version: 1 },
    };
    expect(result!.state).toEqual(expectedState);
  });

  it("should return unchanged document for same version (no-op)", () => {
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction);

    document.state.document.version = 1;

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        fromVersion: 1,
        toVersion: 1,
      },
    };

    const result = applyUpgradeDocumentAction(document, upgradeAction as never);

    expect(result).toBe(document);
    expect(result.state.document.version).toBe(1);
  });

  it("should throw DowngradeNotSupportedError for downgrade attempt", () => {
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction);

    document.state.document.version = 2;

    const upgradeAction = {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:01.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        fromVersion: 2,
        toVersion: 1,
      },
    };

    expect(() =>
      applyUpgradeDocumentAction(document, upgradeAction as never),
    ).toThrow("Downgrade not supported");
  });
});

describe("applyDeleteDocumentAction", () => {
  it("should mark document as deleted", () => {
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
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
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
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
    const document = documentFromCreation({
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
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
