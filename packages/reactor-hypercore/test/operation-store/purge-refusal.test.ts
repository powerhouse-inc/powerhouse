import {
  deriveOperationId,
  generateId,
  purgeDocumentAction,
  purgeMarkerOperation,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { DocumentPurgedError } from "@powerhousedao/reactor";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HypercoreOperationStore } from "../../src/hypercore-operation-store.js";
import {
  createTestHypercoreStores,
  type TestHypercoreSetup,
} from "../factories.js";

const DOCUMENT_TYPE = "powerhouse/document-model";

function marker(documentId: string): Operation {
  return purgeMarkerOperation(
    purgeDocumentAction({
      documentId,
      documentType: DOCUMENT_TYPE,
      requestId: "request-1",
    }),
  );
}

function operation(
  documentId: string,
  scope: string,
  index: number,
): Operation {
  const action = {
    id: generateId(),
    type: "SET_NAME",
    scope,
    timestampUtcMs: new Date().toISOString(),
    input: { name: `name-${index}` },
  };
  return {
    id: deriveOperationId(documentId, scope, "main", action.id),
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  };
}

describe("HypercoreOperationStore on a purged stream", () => {
  let setup: TestHypercoreSetup;
  let store: HypercoreOperationStore;

  beforeEach(async () => {
    setup = await createTestHypercoreStores();
    store = setup.store;
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  async function append(
    documentId: string,
    scope: string,
    revision: number,
    op: Operation,
  ): Promise<Operation[]> {
    return store.apply(
      documentId,
      DOCUMENT_TYPE,
      scope,
      "main",
      revision,
      (txn) => {
        txn.addOperations(op);
      },
    );
  }

  it("refuses a non-marker append in any scope once the marker heads the document stream", async () => {
    const documentId = generateId();
    const first = marker(documentId);
    await append(documentId, "document", 0, first);

    await expect(
      append(documentId, "global", 0, operation(documentId, "global", 0)),
    ).rejects.toSatisfy((e) => DocumentPurgedError.isError(e));
    await expect(
      append(documentId, "document", 1, operation(documentId, "document", 1)),
    ).rejects.toSatisfy((e) => DocumentPurgedError.isError(e));
  });

  it("answers a second marker with the stored one", async () => {
    const documentId = generateId();
    const first = marker(documentId);
    await append(documentId, "document", 0, first);

    const again = await append(documentId, "document", 1, marker(documentId));
    expect(again.map((op) => op.id)).toEqual([first.id]);
    const revisions = await store.getRevisions(documentId, "main");
    expect(revisions.revision.document).toBe(1);
  });
});
