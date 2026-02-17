import type { Operation } from "document-model";
import {
  baseCreateDocument,
  garbageCollectV2,
  generateId,
  mapSkippedOperationsV2,
  processUndoRedo,
  sortOperations,
  undoV2,
} from "document-model/core";
import type { CountDocument } from "document-model/test";
import {
  countReducer,
  createCountDocumentState,
  increment,
  testCreateBaseState,
} from "document-model/test";
import { beforeEach, describe, expect, it } from "vitest";

function getLastContentActionId(document: CountDocument): string {
  const ops = document.operations.global!;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].action.type !== "NOOP") {
      return ops[i].action.id;
    }
  }
  throw new Error("No content operation found");
}

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
      const targetId = getLastContentActionId(document);
      const undoAction = undoV2(targetId);
      const result = processUndoRedo(document, undoAction, 0, 2);

      expect(result.reuseLastOperationIndex).toBe(false);
    });

    it("should always return skip=0 for v2", () => {
      const targetId = getLastContentActionId(document);
      const undoAction = undoV2(targetId);
      const result = processUndoRedo(document, undoAction, 0, 2);

      expect(result.skip).toBe(0);
      expect(result.action.type).toBe("NOOP");
      expect((result.action.input as { undoOf: string }).undoOf).toBe(targetId);
    });

    it("should always return reuseLastOperationIndex: false even after NOOP", () => {
      const targetId = getLastContentActionId(document);
      document = countReducer(document, undoV2(targetId), undefined, {
        protocolVersion: 2,
      });

      const ops = document.operations.global!;
      const remainingContentOps = ops.filter((op) => op.action.type !== "NOOP");
      const nextTargetId =
        remainingContentOps[remainingContentOps.length - 1].action.id;
      const undoAction = undoV2(nextTargetId);
      const result = processUndoRedo(document, undoAction, 0, 2);

      expect(result.reuseLastOperationIndex).toBe(false);
    });
  });

  describe("end-to-end with protocolVersion: 2 in reducer", () => {
    it("should create NOOP operations with skip=0 and undoOf reference", () => {
      const targetId = getLastContentActionId(document);
      document = countReducer(document, undoV2(targetId), undefined, {
        protocolVersion: 2,
      });

      const ops = document.operations.global!;
      const lastOp = ops[ops.length - 1];

      expect(lastOp.action.type).toBe("NOOP");
      expect(lastOp.skip).toBe(0);
      expect(lastOp.index).toBe(3);
      expect((lastOp.action.input as { undoOf: string }).undoOf).toBe(targetId);
    });

    it("should correctly undo state with protocolVersion 2", () => {
      expect(document.state.global.count).toBe(3);

      const targetId = getLastContentActionId(document);
      document = countReducer(document, undoV2(targetId), undefined, {
        protocolVersion: 2,
      });

      expect(document.state.global.count).toBe(2);
    });

    it("consecutive undos should all have skip=0 and incrementing indices", () => {
      const ops0 = document.operations.global!;
      const inc3Id = ops0[2].action.id;
      const inc2Id = ops0[1].action.id;
      const inc1Id = ops0[0].action.id;

      // First undo (undo inc3)
      document = countReducer(document, undoV2(inc3Id), undefined, {
        protocolVersion: 2,
      });

      const ops1 = document.operations.global!;
      const noop1 = ops1[ops1.length - 1];
      expect(noop1.action.type).toBe("NOOP");
      expect(noop1.skip).toBe(0);
      expect(noop1.index).toBe(3);
      expect(document.state.global.count).toBe(2);

      // Second undo (undo inc2)
      document = countReducer(document, undoV2(inc2Id), undefined, {
        protocolVersion: 2,
      });

      const ops2 = document.operations.global!;
      const noop2 = ops2[ops2.length - 1];
      expect(noop2.action.type).toBe("NOOP");
      expect(noop2.skip).toBe(0);
      expect(noop2.index).toBe(4);
      expect(document.state.global.count).toBe(1);

      // Third undo (undo inc1)
      document = countReducer(document, undoV2(inc1Id), undefined, {
        protocolVersion: 2,
      });

      const ops3 = document.operations.global!;
      const noop3 = ops3[ops3.length - 1];
      expect(noop3.action.type).toBe("NOOP");
      expect(noop3.skip).toBe(0);
      expect(noop3.index).toBe(5);
      expect(document.state.global.count).toBe(0);
    });

    it("operations list should preserve all operations including NOOPs", () => {
      const ops0 = document.operations.global!;
      const inc3Id = ops0[2].action.id;
      const inc2Id = ops0[1].action.id;

      document = countReducer(document, undoV2(inc3Id), undefined, {
        protocolVersion: 2,
      });
      document = countReducer(document, undoV2(inc2Id), undefined, {
        protocolVersion: 2,
      });

      const ops = document.operations.global!;
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

    it("should handle undo after new operations added following undos (gapped indices)", () => {
      expect(document.state.global.count).toBe(3);

      const ops0 = document.operations.global!;
      const inc3Id = ops0[2].action.id;
      const inc2Id = ops0[1].action.id;

      // Undo inc3 and inc2: count = 1
      document = countReducer(document, undoV2(inc3Id), undefined, {
        protocolVersion: 2,
      });
      document = countReducer(document, undoV2(inc2Id), undefined, {
        protocolVersion: 2,
      });
      expect(document.state.global.count).toBe(1);

      // Add new operations after undos: count = 3
      document = countReducer(document, increment(), undefined, {
        protocolVersion: 2,
      });
      document = countReducer(document, increment(), undefined, {
        protocolVersion: 2,
      });
      expect(document.state.global.count).toBe(3);

      const opsBeforeUndo = document.operations.global!;
      expect(opsBeforeUndo.map((op) => op.action.type)).toEqual([
        "INCREMENT",
        "INCREMENT",
        "INCREMENT",
        "NOOP",
        "NOOP",
        "INCREMENT",
        "INCREMENT",
      ]);

      // Now undo the last increment
      const lastIncId = getLastContentActionId(document);
      document = countReducer(document, undoV2(lastIncId), undefined, {
        protocolVersion: 2,
      });

      expect(document.state.global.count).toBe(2);

      const opsAfterUndo = document.operations.global!;
      expect(opsAfterUndo.length).toBe(8);
      expect(opsAfterUndo.map((op) => op.action.type)).toEqual([
        "INCREMENT",
        "INCREMENT",
        "INCREMENT",
        "NOOP",
        "NOOP",
        "INCREMENT",
        "INCREMENT",
        "NOOP",
      ]);
    });
  });

  describe("reshuffle stability", () => {
    it("undo survives reshuffle - targets correct operation regardless of position", () => {
      // Simulate:
      // Reactor A: [inc1(ts=1), inc2(ts=2), undo(inc2)(ts=4)]
      // Reactor B: [inc3(ts=3)]
      // After reshuffle: [inc1(ts=1), inc2(ts=2), inc3(ts=3), NOOP(undoOf=inc2)(ts=4)]

      const inc1ActionId = generateId();
      const inc2ActionId = generateId();
      const inc3ActionId = generateId();
      const noopActionId = generateId();

      const operations: Operation[] = [
        {
          id: "op-1",
          index: 0,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:01.000Z",
          action: {
            id: inc1ActionId,
            type: "INCREMENT",
            scope: "global",
            input: {},
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
          },
        },
        {
          id: "op-2",
          index: 1,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:02.000Z",
          action: {
            id: inc2ActionId,
            type: "INCREMENT",
            scope: "global",
            input: {},
            timestampUtcMs: "2024-01-01T00:00:02.000Z",
          },
        },
        {
          id: "op-3",
          index: 2,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:03.000Z",
          action: {
            id: inc3ActionId,
            type: "INCREMENT",
            scope: "global",
            input: {},
            timestampUtcMs: "2024-01-01T00:00:03.000Z",
          },
        },
        {
          id: "op-4",
          index: 3,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:04.000Z",
          action: {
            id: noopActionId,
            type: "NOOP",
            scope: "global",
            input: { undoOf: inc2ActionId },
            timestampUtcMs: "2024-01-01T00:00:04.000Z",
          },
        },
      ];

      // garbageCollectV2 should exclude inc2 (undone by NOOP) but keep inc3
      const sorted = sortOperations([...operations]);
      const gcResult = garbageCollectV2(sorted) as Operation[];
      const gcNonNoop = gcResult.filter((op) => op.action.type !== "NOOP");

      // inc1 and inc3 survive; inc2 is excluded
      expect(gcNonNoop.map((op) => op.action.id)).toEqual([
        inc1ActionId,
        inc3ActionId,
      ]);

      // mapSkippedOperationsV2 should mark inc2 as ignored, inc3 as not ignored
      const mapped = mapSkippedOperationsV2(sorted);

      const inc2Mapped = mapped.find(
        (m) => m.operation.action.id === inc2ActionId,
      );
      const inc3Mapped = mapped.find(
        (m) => m.operation.action.id === inc3ActionId,
      );
      const inc1Mapped = mapped.find(
        (m) => m.operation.action.id === inc1ActionId,
      );

      expect(inc2Mapped!.ignore).toBe(true);
      expect(inc3Mapped!.ignore).toBe(false);
      expect(inc1Mapped!.ignore).toBe(false);
    });

    it("duplicate undoOf references are silently handled", () => {
      const incActionId = generateId();
      const noop1ActionId = generateId();
      const noop2ActionId = generateId();

      const operations: Operation[] = [
        {
          id: "op-1",
          index: 0,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:01.000Z",
          action: {
            id: incActionId,
            type: "INCREMENT",
            scope: "global",
            input: {},
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
          },
        },
        {
          id: "op-2",
          index: 1,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:02.000Z",
          action: {
            id: noop1ActionId,
            type: "NOOP",
            scope: "global",
            input: { undoOf: incActionId },
            timestampUtcMs: "2024-01-01T00:00:02.000Z",
          },
        },
        {
          id: "op-3",
          index: 2,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:03.000Z",
          action: {
            id: noop2ActionId,
            type: "NOOP",
            scope: "global",
            input: { undoOf: incActionId },
            timestampUtcMs: "2024-01-01T00:00:03.000Z",
          },
        },
      ];

      const sorted = sortOperations([...operations]);
      const gcResult = garbageCollectV2(sorted) as Operation[];

      // Both NOOPs kept in history, inc is excluded
      const noops = gcResult.filter((op) => op.action.type === "NOOP");
      const content = gcResult.filter((op) => op.action.type !== "NOOP");
      expect(noops.length).toBe(2);
      expect(content.length).toBe(0);

      // mapSkippedOperationsV2: inc is ignored, both NOOPs ignored
      const mapped = mapSkippedOperationsV2(sorted);
      expect(mapped[0].ignore).toBe(true); // inc (undone)
      expect(mapped[1].ignore).toBe(true); // noop1
      expect(mapped[2].ignore).toBe(true); // noop2
    });

    it("invalid undoOf reference (no matching action) is silently ignored", () => {
      const incActionId = generateId();
      const noopActionId = generateId();

      const operations: Operation[] = [
        {
          id: "op-1",
          index: 0,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:01.000Z",
          action: {
            id: incActionId,
            type: "INCREMENT",
            scope: "global",
            input: {},
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
          },
        },
        {
          id: "op-2",
          index: 1,
          skip: 0,
          hash: "",
          timestampUtcMs: "2024-01-01T00:00:02.000Z",
          action: {
            id: noopActionId,
            type: "NOOP",
            scope: "global",
            input: { undoOf: "nonexistent-id" },
            timestampUtcMs: "2024-01-01T00:00:02.000Z",
          },
        },
      ];

      const sorted = sortOperations([...operations]);
      const mapped = mapSkippedOperationsV2(sorted);

      // inc is NOT ignored (the NOOP targets a nonexistent action)
      expect(mapped[0].ignore).toBe(false);
      // NOOP is still ignored (all NOOPs are ignored)
      expect(mapped[1].ignore).toBe(true);
    });
  });
});
