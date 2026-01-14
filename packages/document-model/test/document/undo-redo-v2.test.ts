import { baseCreateDocument, processUndoRedo, undo } from "document-model/core";
import type { CountDocument } from "document-model/test";
import {
  countReducer,
  createCountDocumentState,
  increment,
  testCreateBaseState,
} from "document-model/test";
import { beforeEach, describe, expect, it } from "vitest";

describe("UNDO/REDO with protocolVersion: 2", () => {
  let document: CountDocument;

  beforeEach(() => {
    const initialState = testCreateBaseState({ count: 0 }, { name: "" });
    document = baseCreateDocument(createCountDocumentState, initialState);

    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
  });

  describe("processUndoRedo with protocolVersion: 2", () => {
    it("should return reuseLastOperationIndex: false", () => {
      const undoAction = undo();
      const result = processUndoRedo(document, undoAction, 0, 2);

      expect(result.reuseLastOperationIndex).toBe(false);
    });

    it("should calculate skip using calculateUndoSkipNumber", () => {
      const undoAction = undo();
      const result = processUndoRedo(document, undoAction, 0, 2);

      expect(result.skip).toBe(1);
      expect(result.action.type).toBe("NOOP");
    });

    it("should always return reuseLastOperationIndex: false even after NOOP", () => {
      document = countReducer(document, undo());

      const undoAction = undo();
      const result = processUndoRedo(document, undoAction, 0, 2);

      expect(result.reuseLastOperationIndex).toBe(false);
    });
  });

  describe("comparison: protocolVersion 1 vs 2", () => {
    it("protocolVersion 1 allows index reuse after NOOP", () => {
      document = countReducer(document, undo());

      const undoAction = undo();
      const resultV1 = processUndoRedo(document, undoAction, 0, 1);

      expect(resultV1.reuseLastOperationIndex).toBe(true);
    });

    it("protocolVersion 2 never allows index reuse", () => {
      document = countReducer(document, undo());

      const undoAction = undo();
      const resultV2 = processUndoRedo(document, undoAction, 0, 2);

      expect(resultV2.reuseLastOperationIndex).toBe(false);
    });
  });

  describe("end-to-end with protocolVersion: 2 in reducer", () => {
    it("should create NOOP operations with correct skip value", () => {
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      const ops = document.operations.global!;
      const lastOp = ops[ops.length - 1];

      expect(lastOp.action.type).toBe("NOOP");
      expect(lastOp.skip).toBe(1);
      expect(lastOp.index).toBe(3);
    });

    it("protocolVersion 2 uses calculateUndoSkipNumber for skip calculation", () => {
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      const ops = document.operations.global!;
      const noopOp = ops.find((op) => op.action.type === "NOOP");

      expect(noopOp).toBeDefined();
      expect(noopOp!.skip).toBe(1);
    });

    it("should correctly undo state with protocolVersion 2", () => {
      expect(document.state.global.count).toBe(3);

      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      expect(document.state.global.count).toBe(2);
    });
  });
});
