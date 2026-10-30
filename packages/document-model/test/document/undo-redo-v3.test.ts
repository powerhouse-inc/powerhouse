import type {
  Action,
  DeriveScope,
  Operation,
  PHBaseState,
  ReducerFor,
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
  SubmittedUndoRefusedError,
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
  pressOn3,
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
  expect(document.header.protocolVersions?.["base-reducer"]).toBe(3);
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

// Version-aware stand-in: rows apply under reducers of differing state types.
function erased<TState extends PHBaseState>(
  reducerFor: ReducerFor,
): ReducerFor<TState> {
  return reducerFor as unknown as ReducerFor<TState>;
}

function targetOf(operation: Operation): string {
  expect(operation.action.type).toBe("RETRACT");
  return (operation.action.input as { target: string }).target;
}

describe("base-reducer 3", () => {
  describe("a dispatched UNDO or REDO", () => {
    it("is refused with the reactor's error, whatever its count", () => {
      const document = dispatch(createV3Document(), increment(), increment());

      for (const action of [undo(), undo(2), redo(), redo(2)]) {
        expect(() => countReducer(document, action)).toThrow(
          SubmittedUndoRefusedError,
        );
      }
      expect(globalOps(document)).toHaveLength(2);
    });

    it("is refused by processUndoRedo, which mints no RETRACT", () => {
      const document = dispatch(createV3Document(), increment());

      for (const action of [undo(), redo()]) {
        let thrown: unknown;
        try {
          processUndoRedo(document, action, 0, 3);
        } catch (error) {
          thrown = error;
        }
        expect(SubmittedUndoRefusedError.isError(thrown)).toBe(true);
        expect(thrown).toMatchObject({
          documentId: document.header.id,
          actionType: action.type,
        });
      }
    });
  });

  describe("a client's UNDO", () => {
    it("is stored as a RETRACT of the last applied content", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b);

      document = pressOn3(document, "UNDO");

      const row = last(document);
      expect(targetOf(row)).toBe(b.id);
      expect(row.index).toBe(2);
      expect(row.skip).toBe(0);
      expect(row.error).toBeUndefined();
      expect(document.state.global.count).toBe(1);
      expect(document.clipboard).toEqual([]);
    });

    it("skips an action that threw", () => {
      const a = increment();
      const document = dispatch(createV3Document(), a, error());

      const undone = pressOn3(document, "UNDO");

      expect(targetOf(last(undone))).toBe(a.id);
      expect(undone.state.global.count).toBe(0);
    });

    it("is refused when nothing is applied", () => {
      expect(() => pressOn3(createV3Document(), "UNDO")).toThrow(
        "Cannot undo: nothing to undo in scope history",
      );
    });
  });

  describe("a client's REDO", () => {
    it("UNDO, REDO, UNDO succeeds", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b);

      document = pressOn3(document, "UNDO");
      const undoRow = last(document);
      expect(document.state.global.count).toBe(1);

      document = pressOn3(document, "REDO");
      expect(targetOf(last(document))).toBe(undoRow.action.id);
      expect(document.state.global.count).toBe(2);

      document = pressOn3(document, "UNDO");
      expect(targetOf(last(document))).toBe(b.id);
      expect(document.state.global.count).toBe(1);
      expect(globalOps(document).every((op) => op.error === undefined)).toBe(
        true,
      );
    });

    it("redoes the undo stack in reverse", () => {
      const a = increment();
      const b = increment();
      let document = dispatch(createV3Document(), a, b);
      document = pressOn3(pressOn3(document, "UNDO"), "UNDO");
      const [undoB, undoA] = globalOps(document).slice(2);
      expect(document.state.global.count).toBe(0);

      document = pressOn3(document, "REDO");
      expect(targetOf(last(document))).toBe(undoA.action.id);
      expect(document.state.global.count).toBe(1);

      document = pressOn3(document, "REDO");
      expect(targetOf(last(document))).toBe(undoB.action.id);
      expect(document.state.global.count).toBe(2);

      expect(() => pressOn3(document, "REDO")).toThrow(
        "Cannot redo: nothing to redo in scope history",
      );
    });

    it("is refused after new content", () => {
      let document = dispatch(createV3Document(), increment(), increment());
      document = countReducer(pressOn3(document, "UNDO"), increment());

      expect(() => pressOn3(document, "REDO")).toThrow(
        "Cannot redo: nothing to redo in scope history",
      );
    });
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
    let document = pressOn3(
      dispatch(createV3Document(), a, increment()),
      "UNDO",
    );
    document = dispatch(document, retract(a.id), increment());
    document = countReducer(document, increment(), undefined, { skip: 1 });

    const derived = deriveScope(
      document,
      globalOps(document),
      () => baseCountReducer,
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

  describe("given a version-aware derivation", () => {
    // Stands in for an upgraded model: the first row applies under an older
    // version, whose INCREMENT adds 10.
    const older: StateReducer = (state, action) => {
      if (action.type === "INCREMENT") {
        (state as unknown as { global: { count: number } }).global.count += 10;
        return;
      }
      return baseCountReducer(state as never, action) as never;
    };
    function versioned(): { derive: DeriveScope; calls: () => number } {
      let calls = 0;
      const derive: DeriveScope = (document, operations, scope, onThrow) => {
        calls++;
        return deriveScope(
          document,
          operations,
          erased((operation) =>
            operation.index === 0
              ? older
              : (baseCountReducer as unknown as StateReducer),
          ),
          scope,
          onThrow,
        );
      };
      return { derive, calls: () => calls };
    }

    it("re-derives a RETRACT through it and hashes the result", () => {
      const a = increment();
      const b = increment();
      const c = increment();
      const { derive } = versioned();
      let document = dispatch(createV3Document(), a, b, c);

      document = countReducer(document, retract(b.id), undefined, {
        deriveScope: derive,
      });

      expect(document.state.global.count).toBe(11);
      expect(last(document).hash).toBe(
        hashDocumentStateForScope(document, "global"),
      );
    });

    it("resolves a client's UNDO from the rows it applied", () => {
      const a = increment();
      const derive: DeriveScope = (document, operations, scope, onThrow) =>
        deriveScope(
          document,
          operations,
          erased((operation) =>
            operation.index === 1
              ? ((() => {
                  throw new Error("older version refuses");
                }) as StateReducer)
              : (baseCountReducer as unknown as StateReducer),
          ),
          scope,
          onThrow,
        );
      const document = dispatch(createV3Document(), a, increment());

      const undone = pressOn3(document, "UNDO", derive);

      expect(targetOf(last(undone))).toBe(a.id);
      expect(undone.state.global.count).toBe(0);
    });

    it("records the error of a rewinding row from it", () => {
      const { derive } = versioned();
      let document = dispatch(createV3Document(), increment(), increment());

      document = countReducer(document, error(), undefined, {
        skip: 1,
        deriveScope: derive,
      });

      expect(last(document).error).toBe("Error action");
      expect(document.state.global.count).toBe(10);
    });

    it("is not used for a row that only appends", () => {
      const { derive, calls } = versioned();
      const document = dispatch(createV3Document(), increment());

      const next = countReducer(document, increment(), undefined, {
        deriveScope: derive,
      });

      expect(calls()).toBe(0);
      expect(next.state.global.count).toBe(2);
    });
  });

  it("applies a base action once", () => {
    const document = dispatch(createV3Document(), setName("renamed"));

    expect(document.header.name).toBe("renamed");
    expect(last(document).action.type).toBe("SET_NAME");
    expect(last(document).error).toBeUndefined();
  });
});
