import { describe, expect, it } from "vitest";
import {
  creationActions,
  creationState,
  documentFromCreation,
} from "./create-document.js";
import type { PHDocument } from "./documents.js";
import { createPresignedHeader } from "./header.js";
import type { Operation } from "./operations.js";
import { defaultBaseState } from "./state.js";
import type { CreateDocumentAction } from "./types.js";

describe("creationState", () => {
  const rows = (document: PHDocument): Operation[] =>
    creationActions(document, { "base-reducer": 3 }).map((action, index) => ({
      id: `op-${index}`,
      index,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    }));

  it("reads back the state creationActions recorded", () => {
    const state = { ...defaultBaseState(), global: { name: "Team" } };
    const document = {
      header: createPresignedHeader(),
      state,
      initialState: state,
      operations: {},
      clipboard: [],
    } as PHDocument;

    expect(creationState(rows(document))).toEqual(state);
  });

  it("is undefined without an UPGRADE_DOCUMENT", () => {
    const document = {
      header: createPresignedHeader(),
      state: defaultBaseState(),
      initialState: defaultBaseState(),
      operations: {},
      clipboard: [],
    } as PHDocument;

    expect(creationState(rows(document).slice(0, 1))).toBeUndefined();
  });
});

describe("documentFromCreation", () => {
  it("should create a document with minimal input", () => {
    const action = {
      id: "action-1",
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2024-01-01T00:00:00.000Z",
      input: {
        documentId: "doc-123",
        model: "powerhouse/document-model",
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document = documentFromCreation(action);

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
        protocolVersions: { "base-reducer": 2 },
      },
    } as CreateDocumentAction;

    const document1 = documentFromCreation(action);
    const document2 = documentFromCreation(action);

    expect(document1).not.toBe(document2);
    expect(document1.header).not.toBe(document2.header);
    expect(document1.state).not.toBe(document2.state);
  });
});
