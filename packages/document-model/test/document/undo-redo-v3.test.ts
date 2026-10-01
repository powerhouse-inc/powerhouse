import type {
  Action,
  Operation,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  deriveScope,
  hashDocumentStateForScope,
  processUndoRedo,
  redo,
  retract,
  setName,
  undo,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  baseCountReducer,
  type CountDocument,
  countReducer,
  createCountDocumentState,
  error,
  increment,
  testCreateBaseState,
} from "../helpers.js";

function createV3Document(): CountDocument {
  const document = baseCreateDocument(
    createCountDocumentState,
    testCreateBaseState({ count: 0 }, { name: "" }),
  );
  document.header.protocolVersions = {
    ...document.header.protocolVersions,
    "base-reducer": 3,
  };
  return document;
}

function dispatch(
  document: CountDocument,
  ...actions: Action[]
): CountDocument {
  return actions.reduce((doc, action) => countReducer(doc, action), document);
}

function globalOps(document: CountDocument): Operation[] {
  return document.operations.global;
}

function last(document: CountDocument): Operation {
  return globalOps(document).at(-1)!;
}

function targetOf(operation: Operation): string {
  expect(operation.action.type).toBe("RETRACT");
  return (operation.action.input as { target: string }).target;
}

describe("base-reducer 3", () => {
  describe("UNDO", () => {
    it("is stored as a RETRACT of the last applied content", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b);

      document = countReducer(document, undo());

      const row = last(document);
      expect(targetOf(row)).toBe(b.id);
      expect(row.index).toBe(2);
      expect(row.skip).toBe(0);
      expect(row.error).toBeUndefined();
      expect(document.state.global.count).toBe(1);
      expect(document.clipboard).toEqual([]);
    });

    it("carries a reshuffle's rewind onto the RETRACT", () => {
      const a = increment();
      const document = dispatch(createV3Document(), a);

      const result = processUndoRedo(document, undo(), 2, 3, baseCountReducer);

      expect(result.action.type).toBe("RETRACT");
      expect(result.skip).toBe(2);
    });

    it("resolves through processUndoRedo given the state reducer", () => {
      const a = increment();
      const document = dispatch(createV3Document(), a);

      const result = processUndoRedo(document, undo(), 0, 3, baseCountReducer);

      expect(result.action.type).toBe("RETRACT");
      expect(result.action.input).toEqual({ target: a.id });
      expect(result.skip).toBe(0);
      expect(result.reuseLastOperationIndex).toBe(false);
      expect(() => processUndoRedo(document, undo(), 0, 3)).toThrow(
        "UNDO on base-reducer 3 needs the state reducer",
      );
    });

    it("skips an action that threw", () => {
      const a = increment();
      const document = dispatch(createV3Document(), a, error());

      const undone = countReducer(document, undo());

      expect(targetOf(last(undone))).toBe(a.id);
      expect(undone.state.global.count).toBe(0);
    });

    it("is refused when nothing is applied", () => {
      expect(() => countReducer(createV3Document(), undo())).toThrow(
        "Cannot undo: nothing to undo in scope history",
      );
    });
  });

  describe("REDO", () => {
    it("UNDO, REDO, UNDO succeeds", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b);

      document = countReducer(document, undo());
      const undoRow = last(document);
      expect(document.state.global.count).toBe(1);

      document = countReducer(document, redo());
      expect(targetOf(last(document))).toBe(undoRow.action.id);
      expect(document.state.global.count).toBe(2);

      document = countReducer(document, undo());
      expect(targetOf(last(document))).toBe(b.id);
      expect(document.state.global.count).toBe(1);
      expect(globalOps(document).every((op) => op.error === undefined)).toBe(
        true,
      );
    });

    it("redoes the undo stack in reverse", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b, undo(), undo());
      const [undoB, undoA] = globalOps(document).slice(2);
      expect(document.state.global.count).toBe(0);

      document = countReducer(document, redo());
      expect(targetOf(last(document))).toBe(undoA.action.id);
      expect(document.state.global.count).toBe(1);

      document = countReducer(document, redo());
      expect(targetOf(last(document))).toBe(undoB.action.id);
      expect(document.state.global.count).toBe(2);

      expect(() => countReducer(document, redo())).toThrow(
        "Cannot redo: nothing to redo in scope history",
      );
    });

    it("is refused after new content", () => {
      const document = dispatch(
        createV3Document(),
        increment(),
        increment(),
        undo(),
        increment(),
      );

      expect(() => countReducer(document, redo())).toThrow(
        "Cannot redo: nothing to redo in scope history",
      );
    });
  });

  it("refuses a count other than 1", () => {
    const document = dispatch(createV3Document(), increment(), increment());

    expect(() => countReducer(document, undo(2))).toThrow(
      "UNDO on base-reducer 3 takes count 1",
    );
    expect(() => countReducer(document, redo(2))).toThrow(
      "REDO on base-reducer 3 takes count 1",
    );
  });

  describe("RETRACT", () => {
    it("applies when dispatched", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b);

      document = countReducer(document, retract(a.id));

      expect(targetOf(last(document))).toBe(a.id);
      expect(last(document).error).toBeUndefined();
      expect(document.state.global.count).toBe(1);
    });

    it("stores inert while its target is absent, and retracts it on arrival", () => {
      const absent = increment();
      let document = dispatch(createV3Document(), increment());

      document = countReducer(document, retract(absent.id));
      expect(targetOf(last(document))).toBe(absent.id);
      expect(last(document).error).toBeUndefined();
      expect(document.state.global.count).toBe(1);

      document = countReducer(document, absent);
      expect(last(document).action.id).toBe(absent.id);
      expect(last(document).error).toBeUndefined();
      expect(document.state.global.count).toBe(1);
    });
  });

  describe("error", () => {
    it("records a throwing action's error on its row only", () => {
      let document = dispatch(createV3Document(), increment());
      const before = globalOps(document).map((op) => ({ ...op }));

      document = countReducer(document, error());

      const ops = globalOps(document);
      expect(ops.slice(0, -1)).toEqual(before);
      expect(last(document).error).toBe("Error action");
      expect(last(document).skip).toBe(0);
      expect(document.state.global.count).toBe(1);
    });

    it("records the error of a throwing row that rewinds, and keeps its skip", () => {
      let document = dispatch(createV3Document(), increment(), increment());

      document = countReducer(document, error(), undefined, { skip: 1 });

      expect(last(document).error).toBe("Error action");
      expect(last(document).skip).toBe(1);
      expect(document.state.global.count).toBe(1);
    });

    it("records no error on a retracted row or the RETRACT", () => {
      const failing = error();
      let document = dispatch(createV3Document(), retract(failing.id));

      document = countReducer(document, failing);

      expect(globalOps(document).map((op) => op.error)).toEqual([
        undefined,
        undefined,
      ]);
    });
  });

  it("hashes the derived state of the scope", () => {
    const a = increment();
    let document = dispatch(
      createV3Document(),
      a,
      increment(),
      undo(),
      retract(a.id),
      increment(),
    );
    document = countReducer(document, increment(), undefined, { skip: 1 });

    const derived = deriveScope(
      document,
      globalOps(document),
      () => baseCountReducer as unknown as StateReducer,
    );
    expect(document.state.global).toEqual(derived.document.state.global);
    expect(last(document).hash).toBe(
      hashDocumentStateForScope(derived.document, "global"),
    );
  });

  it("re-derives on a row with skip > 0", () => {
    let document = dispatch(
      createV3Document(),
      increment(),
      increment(),
      increment(),
    );

    document = countReducer(document, increment(), undefined, { skip: 1 });

    expect(last(document).skip).toBe(1);
    expect(document.state.global.count).toBe(3);
  });

  it("applies a base action once", () => {
    const document = dispatch(createV3Document(), setName("renamed"));

    expect(document.header.name).toBe("renamed");
    expect(last(document).action.type).toBe("SET_NAME");
    expect(last(document).error).toBeUndefined();
  });
});
