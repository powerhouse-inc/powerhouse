import { describe, expect, it } from "vitest";
import {
  actionSigningTarget,
  DOCUMENT_SCOPE_ACTION_TYPES,
} from "./action-signature.js";
import {
  isPurgeMarker,
  PURGE_DOCUMENT,
  purgeDocumentAction,
  purgedProtocolVersions,
  purgeMarkerOperation,
} from "./purge.js";
import { deriveOperationId } from "./utils.js";
import {
  isReservedOperationName,
  RESERVED_OPERATION_NAMES,
} from "./validation.js";

const input = {
  documentId: "doc-1",
  documentType: "powerhouse/document-model",
  requestId: "request-1",
};

describe("PURGE_DOCUMENT", () => {
  it("is a reserved operation name", () => {
    expect(RESERVED_OPERATION_NAMES).toContain(PURGE_DOCUMENT);
    expect(isReservedOperationName("purge_document")).toBe(true);
  });

  it("is a document-scope action signed against its input's documentId", () => {
    expect(DOCUMENT_SCOPE_ACTION_TYPES.has(PURGE_DOCUMENT)).toBe(true);
    expect(
      actionSigningTarget(purgeDocumentAction(input), "elsewhere", "main"),
    ).toEqual({ documentId: "doc-1", branch: "main" });
  });
});

describe("purgeDocumentAction", () => {
  it("stamps purgedAtUtcIso with the action's own timestamp", () => {
    const action = purgeDocumentAction(input, {
      timestampUtcMs: "2026-09-29T00:00:00.000Z",
    });
    expect(action).toMatchObject({
      type: PURGE_DOCUMENT,
      scope: "document",
      timestampUtcMs: "2026-09-29T00:00:00.000Z",
      input: { ...input, purgedAtUtcIso: "2026-09-29T00:00:00.000Z" },
    });
    expect(action.context).toBeUndefined();
  });

  it("takes a fresh id per marker, never derived from the document", () => {
    const first = purgeDocumentAction(input);
    const second = purgeDocumentAction(input);
    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toContain(input.documentId);
    expect(first.input.purgedAtUtcIso).toBe(first.timestampUtcMs);
  });
});

describe("purgeMarkerOperation", () => {
  it("is the stream's sole row at document/main index 0", () => {
    const action = purgeDocumentAction(input);
    expect(purgeMarkerOperation(action)).toEqual({
      id: deriveOperationId("doc-1", "document", "main", action.id),
      index: 0,
      skip: 0,
      timestampUtcMs: action.timestampUtcMs,
      hash: "",
      action,
    });
  });
});

describe("isPurgeMarker", () => {
  const action = purgeDocumentAction(input);
  const operation = purgeMarkerOperation(action);
  const other = {
    ...operation,
    action: { ...action, type: "DELETE_DOCUMENT" },
  };

  it("recognises an action, an operation and an operation with context", () => {
    expect(isPurgeMarker(action)).toBe(true);
    expect(isPurgeMarker(operation)).toBe(true);
    expect(isPurgeMarker({ operation, context: {} as never })).toBe(true);
  });

  it("rejects every other action", () => {
    expect(isPurgeMarker(other.action)).toBe(false);
    expect(isPurgeMarker(other)).toBe(false);
    expect(isPurgeMarker({ operation: other, context: {} as never })).toBe(
      false,
    );
    expect(isPurgeMarker({ action: undefined })).toBe(false);
  });
});

describe("purgedProtocolVersions", () => {
  it("is document-purge 1, a fresh object each call", () => {
    const first = purgedProtocolVersions();
    expect(first).toEqual({ "document-purge": 1 });
    first["document-purge"] = 2;
    expect(purgedProtocolVersions()).toEqual({ "document-purge": 1 });
  });
});
