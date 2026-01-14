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

    it("should always return skip=1 for v2", () => {
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

    it("protocolVersion 2 always creates NOOPs with skip=1", () => {
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

    it("consecutive undos should all have skip=1 and incrementing indices", () => {
      // First undo
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      const ops1 = document.operations.global!;
      const noop1 = ops1[ops1.length - 1];
      expect(noop1.action.type).toBe("NOOP");
      expect(noop1.skip).toBe(1);
      expect(noop1.index).toBe(3);
      expect(document.state.global.count).toBe(2);

      // Second undo
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      const ops2 = document.operations.global!;
      const noop2 = ops2[ops2.length - 1];
      expect(noop2.action.type).toBe("NOOP");
      expect(noop2.skip).toBe(1);
      expect(noop2.index).toBe(4); // Should increment, not reuse
      expect(document.state.global.count).toBe(1);

      // Third undo
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      const ops3 = document.operations.global!;
      const noop3 = ops3[ops3.length - 1];
      expect(noop3.action.type).toBe("NOOP");
      expect(noop3.skip).toBe(1);
      expect(noop3.index).toBe(5); // Should increment, not reuse
      expect(document.state.global.count).toBe(0);
    });

    it("should throw when trying to undo more than available", () => {
      // Undo all 3 increments
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      expect(document.state.global.count).toBe(0);

      // Try to undo when there's nothing left
      expect(() =>
        countReducer(document, undo(), undefined, {
          protocolVersion: 2,
        }),
      ).toThrow("Cannot undo: no more operations to undo in scope history");
    });

    it("operations list should preserve all operations including NOOPs", () => {
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });
      document = countReducer(document, undo(), undefined, {
        protocolVersion: 2,
      });

      const ops = document.operations.global!;
      // Should have: 3 increments + 2 NOOPs = 5 operations
      expect(ops.length).toBe(5);
      expect(ops.map((op) => op.action.type)).toEqual([
        "INCREMENT",
        "INCREMENT",
        "INCREMENT",
        "NOOP",
        "NOOP",
      ]);
      expect(ops.map((op) => op.index)).toEqual([0, 1, 2, 3, 4]);
    });
  });
});
