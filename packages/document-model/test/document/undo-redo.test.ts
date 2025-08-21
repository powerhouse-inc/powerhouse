import { type Action, type Operation } from "#document/types.js";
import { beforeEach, describe, expect, it } from "vitest";
import { noop, redo, undo } from "../../src/document/actions/creators.js";
import { processUndoRedo } from "../../src/document/reducer.js";
import { baseCreateDocument } from "../../src/document/utils/base.js";
import {
  type CountAction,
  type CountDocument,
  countReducer,
  createBaseState,
  createCountDocumentState,
  increment,
} from "../helpers.js";

describe("UNDO/REDO", () => {
  let document: CountDocument;

  beforeEach(() => {
    const initialState = createBaseState({ count: 0 }, { name: "" });

    document = baseCreateDocument(createCountDocumentState, initialState);

    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());
  });

  describe("processUndoRedo -> UNDO", () => {
    it("should return a NOOP action when an UNDO action is dispatched", () => {
      const skip = 0;
      const undoAction = undo();
      const result = processUndoRedo(document, undoAction, skip);

      expect(result.action.type).toBe("NOOP");
    });

    it("should return skip = undo value if there's no skip value passed to the reducer", () => {
      const skip = 0;
      const undoAction = undo();
      const result = processUndoRedo(document, undoAction, skip);

      expect(result.skip).toBe(1);
      expect(result.action.type).toBe("NOOP");
    });

    it("should return skip = undo value + previous NOOP skip value, when latest action is NOOP with skip > 0", () => {
      const skip = 0;
      const undoAction = undo();

      document = countReducer(document, noop(), undefined, {
        skip: 3,
        ignoreSkipOperations: true,
      });
      const result = processUndoRedo(document, undoAction, skip);

      expect(result.skip).toBe(4);
      expect(result.action.type).toBe("NOOP");
    });

    it("should NOT remove latest operation if !== NOOP", () => {
      const skip = 0;
      const undoAction = undo();
      const result = processUndoRedo(document, undoAction, skip);

      expect(result.skip).toBe(1);
      expect(result.document.operations.global.length).toBe(5);
      expect(result.document.operations.global[4].action.type).toBe(
        "INCREMENT",
      );
    });

    it("should NOT remove latest operation if is a NOOP with skip = 0", () => {
      const skip = 0;
      const undoAction = undo();

      document = countReducer(document, noop(), undefined, {
        skip: 0,
        ignoreSkipOperations: true,
      });
      const result = processUndoRedo(document, undoAction, skip);

      expect(result.skip).toBe(1);
      expect(result.document.operations.global.length).toBe(6);
      expect(result.document.operations.global[5].action.type).toBe("NOOP");
    });

    it("should throw an error if you try to undone more operations than the ones available", () => {
      const initialState = createBaseState({ count: 0 }, { name: "" });

      document = baseCreateDocument(createCountDocumentState, initialState);

      const skip = 0;
      const undoAction = undo();
      const throwErrorFunc = () => processUndoRedo(document, undoAction, skip);

      expect(throwErrorFunc).toThrow(
        "Cannot undo: you can't undo more operations than the ones in the scope history",
      );
    });
  });

  describe("processUndoRedo -> REDO", () => {
    it("should throw an error when there's no operation to redo in the clipboard", () => {
      const initialState = createBaseState({ count: 0 }, { name: "" });

      document = baseCreateDocument(createCountDocumentState, initialState);

      const skip = 0;
      const redoAction = redo();
      const throwErrorFunc = () => processUndoRedo(document, redoAction, skip);

      expect(throwErrorFunc).toThrow(
        "Cannot redo: no operations in the clipboard",
      );
    });

    it("should throw an error if you try to redo more than 1 operation", () => {
      const skip = 0;
      const redoAction = redo(2);
      const throwErrorFunc = () => processUndoRedo(document, redoAction, skip);

      expect(throwErrorFunc).toThrow(
        "Cannot redo: you can only redo one operation at a time",
      );
    });

    it("should throw an error if you try to redo with an skip value", () => {
      const skip = 1;
      const redoAction = redo(1);
      const throwErrorFunc = () => processUndoRedo(document, redoAction, skip);

      expect(throwErrorFunc).toThrow(
        "Cannot redo: skip value from reducer cannot be used with REDO action",
      );
    });

    it("should throw an error if there's no operations for the scope in the clipboard", () => {
      const skip = 0;
      const redoAction = redo(1, "local");

      document = countReducer(document, undo(1));

      const throwErrorFunc = () => processUndoRedo(document, redoAction, skip);
      expect(throwErrorFunc).toThrow(
        'Cannot redo: no operations in clipboard for scope "local"',
      );
    });

    it("should transform REDO action into the latest valid action stored in the clipboard", () => {
      const skip = 0;
      const redoAction = redo(1);

      document = countReducer(document, undo(1));
      const result = processUndoRedo(document, redoAction, skip);

      expect(result.action.type).toBe("INCREMENT");
      expect(result.action.scope).toBe("global");
      expect(result.action.input).toStrictEqual({});
    });

    it("should remove the latest valid action from the clipboard", () => {
      const skip = 0;
      const redoAction = redo(1);

      document = countReducer(document, undo(1));
      expect(document.clipboard.length).toBe(1);

      const result = processUndoRedo(document, redoAction, skip);

      expect(result.document.clipboard.length).toBe(0);
    });
  });

  describe("UNDO", () => {
    it("should undo operations", () => {
      document = countReducer(document, undo(1));

      expect(document.header.revision.global).toBe(6);
      expect(document.state.global.count).toBe(4);

      expect(document.clipboard.length).toBe(1);
      expect(document.clipboard[0].action.type).toBe("INCREMENT");
      expect(document.clipboard[0].index).toBe(4);

      expect(document.operations.global.length).toBe(5);
      expect(document.operations.global[4]).toMatchObject({
        type: "NOOP",
        index: 5,
        skip: 1,
      });
      expect(document.operations.global[3]).toMatchObject({
        type: "INCREMENT",
        index: 3,
        skip: 0,
      });
      expect(document.operations.global[2]).toMatchObject({
        type: "INCREMENT",
        index: 2,
        skip: 0,
      });
    });

    it("should increase skip value of a previous undo Operation", () => {
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, undo());

      expect(document.header.revision.global).toBe(6);
      expect(document.state.global.count).toBe(2);

      expect(document.clipboard.length).toBe(3);
      expect(document.clipboard[0].action.type).toBe("INCREMENT");
      expect(document.clipboard[0].index).toBe(4);
      expect(document.clipboard[1].action.type).toBe("INCREMENT");
      expect(document.clipboard[1].index).toBe(3);
      expect(document.clipboard[2].action.type).toBe("INCREMENT");
      expect(document.clipboard[2].index).toBe(2);

      expect(document.operations.global.length).toBe(3);
      expect(document.operations.global[2]).toMatchObject({
        type: "NOOP",
        index: 5,
        skip: 3,
      });
      expect(document.operations.global[1]).toMatchObject({
        type: "INCREMENT",
        index: 1,
        skip: 0,
      });
      expect(document.operations.global[0]).toMatchObject({
        type: "INCREMENT",
        index: 0,
        skip: 0,
      });
    });

    it("should undo the latest valid operation if undo overlaps with a previous undo operation", () => {
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, increment());
      document = countReducer(document, increment());
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, undo());

      expect(document.header.revision.global).toBe(9);
      expect(document.state.global.count).toBe(1);

      expect(document.clipboard.length).toBe(3);
      expect(document.clipboard[0].action.type).toBe("INCREMENT");
      expect(document.clipboard[0].index).toBe(7);
      expect(document.clipboard[1].action.type).toBe("INCREMENT");
      expect(document.clipboard[1].index).toBe(6);
      expect(document.clipboard[2].action.type).toBe("INCREMENT");
      expect(document.clipboard[2].index).toBe(1);

      expect(document.operations.global.length).toBe(2);
      expect(document.operations.global).toMatchObject([
        {
          type: "INCREMENT",
          index: 0,
          skip: 0,
        },
        {
          type: "NOOP",
          index: 8,
          skip: 7,
        },
      ]);
    });

    it("should undo the latest valid operation if undo overlaps with 2 previous undo operations", () => {
      document = countReducer(document, undo());
      document = countReducer(document, increment());
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, increment());
      document = countReducer(document, undo());
      document = countReducer(document, undo());

      expect(document.header.revision.global).toBe(10);
      expect(document.state.global.count).toBe(2);

      expect(document.clipboard.length).toBe(2);
      expect(document.clipboard[0].action.type).toBe("INCREMENT");
      expect(document.clipboard[0].index).toBe(8);
      expect(document.clipboard[1].action.type).toBe("INCREMENT");
      expect(document.clipboard[1].index).toBe(2);

      expect(document.operations.global.length).toBe(3);
      expect(document.operations.global).toMatchObject([
        {
          type: "INCREMENT",
          index: 0,
          skip: 0,
        },
        {
          type: "INCREMENT",
          index: 1,
          skip: 0,
        },
        {
          type: "NOOP",
          index: 9,
          skip: 7,
        },
      ]);
    });
  });

  describe("REDO", () => {
    it("should redo the latest operation", () => {
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, redo());

      expect(document.header.revision.global).toBe(7);
      expect(document.state.global.count).toBe(4);
      expect(document.operations.global.length).toBe(5);
      expect(document.clipboard.length).toBe(1);
      expect(document.operations.global[4]).toMatchObject({
        type: "INCREMENT",
        index: 6,
      });
    });

    it("should revert document state to the latest state before applying an undo", () => {
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, redo());
      document = countReducer(document, redo());

      expect(document.header.revision.global).toBe(8);
      expect(document.state.global.count).toBe(5);
      expect(document.operations.global.length).toBe(6);
      expect(document.clipboard.length).toBe(0);
      expect(document.operations.global[5]).toMatchObject({
        type: "INCREMENT",
        index: 7,
        skip: 0,
      });
      expect(document.operations.global[4]).toMatchObject({
        type: "INCREMENT",
        index: 6,
        skip: 0,
      });
      expect(document.operations.global[3]).toMatchObject({
        type: "NOOP",
        index: 5,
        skip: 2,
      });
      expect(document.operations.global[2]).toMatchObject({
        type: "INCREMENT",
        index: 2,
        skip: 0,
      });
      expect(document.operations.global[1]).toMatchObject({
        type: "INCREMENT",
        index: 1,
        skip: 0,
      });
      expect(document.operations.global[0]).toMatchObject({
        type: "INCREMENT",
        index: 0,
        skip: 0,
      });
    });

    it("should clean clipboard after applying an action that's not UNDO/REDO", () => {
      document = countReducer(document, undo());
      document = countReducer(document, undo());
      document = countReducer(document, increment());

      expect(document.header.revision.global).toBe(7);
      expect(document.state.global.count).toBe(4);
      expect(document.operations.global.length).toBe(5);
      expect(document.clipboard.length).toBe(0);
    });
  });

  describe("NOOP operations", () => {
    it("should apply NOOP operations", () => {
      const op = {
        // using a fixed id, even though Action ids and Operation ids are different
        id: "noop-1",
        timestampUtcMs: new Date().toISOString(),
        input: {},
        type: "NOOP",
        skip: 1,
        index: 5,
        scope: "global",
        hash: "Ki38EB6gkUcnU3ceRsc88njPo3U=",
      };

      document = countReducer(document, op as CountAction, undefined, {
        skip: 1,
      });

      expect(document.header.revision.global).toBe(6);
      expect(document.state.global.count).toBe(4);
      expect(document.operations.global.length).toBe(5);
      expect(document.operations.global[4]).toMatchObject({
        type: "NOOP",
        index: 5,
        skip: 1,
      });
    });

    it("should replace previous noop operation and update skip number when a new noop is dispatched after another one", () => {
      const baseAction: Action = {
        id: "noop-2",
        timestampUtcMs: new Date().toISOString(),
        input: {},
        type: "NOOP",
        scope: "global",
      };

      const baseOperation: Operation = {
        id: "noop-2",
        skip: 0,
        index: 5,
        hash: "Ki38EB6gkUcnU3ceRsc88njPo3U=",
        timestampUtcMs: new Date().toISOString(),
        action: baseAction,
      };

      const action1 = { ...baseAction } as CountAction;
      const action2 = { ...baseAction } as CountAction;
      const action3 = { ...baseAction } as CountAction;

      const op1 = { ...baseOperation, skip: 1 };
      const op2 = { ...baseOperation, skip: 2 };
      const op3 = { ...baseOperation, skip: 3 };

      document = countReducer(document, action1, undefined, {
        pruneOnSkip: true,
        skip: 1,
        replayOptions: {
          operation: op1,
        },
      });
      document = countReducer(document, action2, undefined, {
        pruneOnSkip: true,
        skip: 2,
        replayOptions: {
          operation: op2,
        },
      });
      document = countReducer(document, action3, undefined, {
        pruneOnSkip: true,
        skip: 3,
        replayOptions: {
          operation: op3,
        },
      });

      expect(document.header.revision.global).toBe(6);
      expect(document.state.global.count).toBe(2);
      expect(document.operations.global.length).toBe(3);
      expect(document.operations.global[2]).toMatchObject({
        index: 5,
        skip: 3,
      });
      expect(document.operations.global[2].action).toMatchObject({
        type: "NOOP",
      });
    });

    it("NOOP operation should not add skipped operation to the clipboard", () => {
      const op = {
        id: "noop-3",
        input: {},
        type: "NOOP",
        skip: 1,
        index: 5,
        scope: "global",
        hash: "Ki38EB6gkUcnU3ceRsc88njPo3U=",
        timestampUtcMs: new Date().toISOString(),
      };

      document = countReducer(document, op as CountAction, undefined, {
        skip: 1,
      });

      expect(document.clipboard.length).toBe(0);
    });
  });
});
