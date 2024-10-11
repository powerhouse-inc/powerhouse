import { describe, it, expect, beforeEach } from "vitest";
import { Document, utils, ExtendedState } from "../../src/document";
import { createDocument, createExtendedState } from "../../src/document/utils";
import { documentHelpers } from "../../src/document/utils";
import {
  CountState,
  CountAction,
  CountLocalState,
  countReducer,
  increment,
  baseCountReducer,
} from "../helpers";

describe("Document Operation ID", () => {
  let document: Document<CountState, CountAction, CountLocalState>;
  let initialState: ExtendedState<CountState, CountLocalState>;

  beforeEach(() => {
    initialState = createExtendedState<CountState, CountLocalState>({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: {} },
    });

    document = createDocument<CountState, CountAction, CountLocalState>(
      initialState,
    );
  });

  it("should add an id to new operations", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    expect(document.operations.global.length).toBe(3);
    for (const operation of document.operations.global) {
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

    const ids = document.operations.global.map((operation) => operation.id);
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
        global: document.operations.global.map((op) => ({
          ...op,
          id: undefined,
        })),
      },
    };

    document = countReducer(document, increment());

    expect(document.operations.global).toHaveLength(4);
    for (const operation of document.operations.global) {
      if (operation.index === 3) {
        expect(operation.id).toBeDefined();
      } else {
        expect(operation.id).toBeUndefined();
      }
    }
  });

  it("should not add id field if existing operation does not include it", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = {
      ...document,
      operations: {
        ...document.operations,
        global: document.operations.global.map((op) => {
          const { id, ...operation } = op;
          return operation;
        }),
      },
    };

    document = countReducer(document, increment());

    expect(document.operations.global).toHaveLength(4);
    for (const operation of document.operations.global) {
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

    const clearedOperations = documentHelpers.garbageCollectDocumentOperations(
      document.operations,
    );

    const replayedDoc = utils.replayOperations(
      initialState,
      clearedOperations,
      baseCountReducer,
    );

    expect(replayedDoc.operations.global).toHaveLength(3);
    expect(document.operations.global).toHaveLength(3);

    for (let i = 0; i < document.operations.global.length; i++) {
      expect(replayedDoc.operations.global[i].id).toBe(
        document.operations.global[i].id,
      );
    }
  });

  it("should not assign an id to existing operations when replay document", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = {
      ...document,
      operations: {
        ...document.operations,
        global: document.operations.global.map((op) => ({
          ...op,
          id: undefined,
        })),
      },
    };

    document = countReducer(document, increment());

    const clearedOperations = documentHelpers.garbageCollectDocumentOperations(
      document.operations,
    );

    const replayedDoc = utils.replayOperations(
      initialState,
      clearedOperations,
      baseCountReducer,
    );

    expect(replayedDoc.operations.global).toHaveLength(4);
    expect(document.operations.global).toHaveLength(4);

    for (let i = 0; i < document.operations.global.length; i++) {
      if (i === 3) {
        expect(replayedDoc.operations.global[i].id).toBeDefined();
      } else {
        expect(replayedDoc.operations.global[i].id).toBeUndefined();
      }

      expect(replayedDoc.operations.global[i].id).toBe(
        document.operations.global[i].id,
      );
    }
  });

  it("should not add id if existing operation does not include id field when replay document", () => {
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = {
      ...document,
      operations: {
        ...document.operations,
        global: document.operations.global.map((op) => {
          const { id, ...operation } = op;
          return operation;
        }),
      },
    };

    document = countReducer(document, increment());

    const clearedOperations = documentHelpers.garbageCollectDocumentOperations(
      document.operations,
    );

    const replayedDoc = utils.replayOperations(
      initialState,
      clearedOperations,
      baseCountReducer,
    );

    expect(replayedDoc.operations.global).toHaveLength(4);
    expect(document.operations.global).toHaveLength(4);

    for (let i = 0; i < document.operations.global.length; i++) {
      if (i === 3) {
        expect(replayedDoc.operations.global[i].id).toBeDefined();
      } else {
        expect(replayedDoc.operations.global[i].id).toBeUndefined();
      }

      expect(replayedDoc.operations.global[i].id).toBe(
        document.operations.global[i].id,
      );
    }
  });
});
