import {
  baseCreateDocument,
  garbageCollectDocumentOperations,
  replayOperations,
} from "document-model/core";
import type { CountDocument, CountPHState } from "document-model/test";
import {
  baseCountReducer,
  countReducer,
  createCountDocumentState,
  increment,
  testCreateBaseState,
} from "document-model/test";
import { beforeEach, describe, expect, it } from "vitest";

describe("Document Operation ID", () => {
  let document: CountDocument;
  let initialState: CountPHState;

  beforeEach(() => {
    initialState = testCreateBaseState({ count: 0 }, { name: "" });

    document = baseCreateDocument(createCountDocumentState, initialState);
  });

  it("should add an id to new operations", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    expect(document.operations.global!.length).toBe(3);
    for (const operation of document.operations.global!) {
      expect(operation.id).toBeDefined();
    }
  });

  it("should not use the same id for different operations", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    const ids = document.operations.global!.map((operation) => operation.id);
    expect(new Set(ids).size).toBe(10);
  });

  it("should not assign an id to existing operations", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = {
      ...document,
      operations: {
        ...document.operations,
        global: document.operations.global!.map((op) => ({
          ...op,
          id: undefined,
        })) as unknown as typeof document.operations.global,
      },
    };

    document = countReducer(document, increment());

    expect(document.operations.global!).toHaveLength(4);
    for (const operation of document.operations.global!) {
      if (operation.index === 3) {
        expect(operation.id).toBeDefined();
      } else {
        expect(operation.id).toBeUndefined();
      }
    }
  });

  it("should not change operations id when replay deocument", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    const clearedOperations = garbageCollectDocumentOperations(
      document.operations,
    );

    const replayedDoc = replayOperations<CountPHState>(
      initialState,
      clearedOperations,
      baseCountReducer,
      document.header,
    );

    expect(replayedDoc.operations.global!).toHaveLength(3);
    expect(document.operations.global!).toHaveLength(3);

    for (let i = 0; i < document.operations.global!.length; i++) {
      expect(replayedDoc.operations.global![i].id).toBe(
        document.operations.global![i].id,
      );
    }
  });

  it("should derive ids for existing operations without ids when replay document", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = {
      ...document,
      operations: {
        ...document.operations,
        global: document.operations.global!.map((op) => ({
          ...op,
          id: undefined,
        })) as unknown as typeof document.operations.global,
      },
    };

    document = countReducer(document, increment());

    const clearedOperations = garbageCollectDocumentOperations(
      document.operations,
    );

    const replayedDoc = replayOperations<CountPHState>(
      initialState,
      clearedOperations,
      baseCountReducer,
      document.header,
    );

    expect(replayedDoc.operations.global!).toHaveLength(4);
    expect(document.operations.global!).toHaveLength(4);

    for (let i = 0; i < document.operations.global!.length; i++) {
      expect(replayedDoc.operations.global![i].id).toBeDefined();
    }
  });

  it("should derive ids for operations missing id field when replay document", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = {
      ...document,
      operations: {
        ...document.operations,
        global: document.operations.global!.map((op) => {
          const { id: _id, ...operation } = op;
          return operation;
        }) as unknown as typeof document.operations.global,
      },
    };

    document = countReducer(document, increment());

    const clearedOperations = garbageCollectDocumentOperations(
      document.operations,
    );

    const replayedDoc = replayOperations<CountPHState>(
      initialState,
      clearedOperations,
      baseCountReducer,
      document.header,
    );

    expect(replayedDoc.operations.global!).toHaveLength(4);
    expect(document.operations.global!).toHaveLength(4);

    for (let i = 0; i < document.operations.global!.length; i++) {
      expect(replayedDoc.operations.global![i].id).toBeDefined();
    }
  });
});
