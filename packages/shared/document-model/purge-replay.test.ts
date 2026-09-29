import { describe, expect, it } from "vitest";
import type { PHDocumentHeader } from "./documents.js";
import { baseCreateDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import { purgeDocumentAction, purgeMarkerOperation } from "./purge.js";
import { createReducer } from "./reducer.js";
import type { PHBaseState } from "./state.js";
import { applyDeleteDocumentAction } from "./upgrades.js";
import { replayDocumentVersioned } from "./versioned-replay.js";

const purgedAt = "2026-09-01T12:00:00.000Z";

function marker(documentId: string) {
  return purgeMarkerOperation(
    purgeDocumentAction(
      { documentId, documentType: "test/purge", requestId: "request-1" },
      { timestampUtcMs: purgedAt },
    ),
  );
}

describe("applyDeleteDocumentAction", () => {
  it("applies a purge marker as a deletion at purgedAtUtcIso", () => {
    const document = baseCreateDocument<PHBaseState>(() => ({}) as PHBaseState);
    const { action } = marker(document.header.id);

    const deleted = applyDeleteDocumentAction(document, {
      ...action,
      input: { ...action.input, purgedAtUtcIso: "2026-09-02T00:00:00.000Z" },
    });

    expect(deleted.state.document.isDeleted).toBe(true);
    expect(deleted.state.document.deletedAtUtcIso).toBe(
      "2026-09-02T00:00:00.000Z",
    );
  });
});

describe("replayDocumentVersioned", () => {
  it("applies a marker in the document scope as a deletion", () => {
    const seed = baseCreateDocument<PHBaseState>(() => ({}) as PHBaseState);
    const header: PHDocumentHeader = {
      ...seed.header,
      documentType: "test/purge",
      revision: { document: 0 },
    };
    const at = "2026-01-01T00:00:00.000Z";
    // A fromVersion 0 upgrade is what selects the versioned path.
    const documentOps = [
      {
        id: "op-create",
        index: 0,
        skip: 0,
        hash: "",
        timestampUtcMs: at,
        action: {
          id: "a-create",
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: at,
          input: { model: "test/purge" },
        },
      },
      {
        id: "op-upgrade",
        index: 1,
        skip: 0,
        hash: "",
        timestampUtcMs: at,
        action: {
          id: "a-upgrade",
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          timestampUtcMs: at,
          input: { fromVersion: 0, toVersion: 1, initialState: seed.state },
        },
      },
      { ...marker(header.id), index: 2 },
    ] as Operation[];

    const result = replayDocumentVersioned(
      seed.state,
      { document: documentOps },
      { reducers: { 1: createReducer<PHBaseState>(() => undefined) } },
      header,
      undefined,
      { checkHashes: false },
    );

    expect(result.state.document.isDeleted).toBe(true);
    expect(result.state.document.deletedAtUtcIso).toBe(purgedAt);
  });
});
