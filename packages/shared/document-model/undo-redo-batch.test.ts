import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { setName } from "./actions.js";
import { capabilitiesOf } from "./base-reducer-protocol.js";
import { baseCreateDocument, type PHDocument } from "./documents.js";
import { NoUndoRedoTargetError } from "./errors.js";
import type { Operation } from "./operations.js";
import { defaultBaseState, type PHBaseState } from "./state.js";
import type { StateReducer } from "./types.js";
import { undoRedoBatch } from "./undo-redo-batch.js";

type CountState = PHBaseState & {
  global: { count: number };
  local: { count: number };
};

const at = "2026-10-23T00:00:00.000Z";

function action(id: string, type = "INC", scope = "global"): Action {
  return { id, type, input: {}, scope, timestampUtcMs: at };
}

const R = (target: string, id = `R(${target})`): Action => ({
  ...action(id, "RETRACT"),
  input: { target },
});

const reducer: StateReducer<CountState> = (state, act) => {
  if (act.type === "INC") {
    state[act.scope as "global" | "local"].count += 1;
  }
};

function documentWith(...stored: Action[]): PHDocument<CountState> {
  const document = baseCreateDocument<CountState>(() => ({
    ...defaultBaseState(),
    global: { count: 0 },
    local: { count: 0 },
  }));
  const rows: Operation[] = stored.map((act, index) => ({
    id: `op-${index}`,
    index,
    skip: 0,
    hash: "",
    timestampUtcMs: at,
    action: act,
  }));
  return { ...document, operations: { global: rows } };
}

function batchOn(document: PHDocument<CountState>) {
  return undoRedoBatch(document, capabilitiesOf(3), reducer);
}

const retracted = (actions: readonly Action[]) =>
  actions
    .filter((act) => act.type === "RETRACT")
    .map((act) => (act.input as { target: string }).target);

describe("undoRedoBatch", () => {
  it("retracts an action added earlier in the same batch", () => {
    const batch = batchOn(documentWith(action("x")));
    const a = action("a");
    batch.add(a);
    batch.undoOrRedo("UNDO", "global");
    const b = action("b");
    batch.add(b);

    expect(batch.actions.map((act) => act.type)).toEqual([
      "INC",
      "RETRACT",
      "INC",
    ]);
    expect(batch.actions[0]).toBe(a);
    expect(batch.actions[2]).toBe(b);
    expect(retracted(batch.actions)).toEqual(["a"]);
  });

  it("counts batch-local rows, then stored ones, for repeated undos", () => {
    const batch = batchOn(documentWith(action("x"), action("y")));
    batch.add(action("a"));
    batch.undoOrRedo("UNDO", "global");
    batch.undoOrRedo("UNDO", "global");
    batch.undoOrRedo("UNDO", "global");

    expect(retracted(batch.actions)).toEqual(["a", "y", "x"]);
  });

  it("does not undo a base action", () => {
    const batch = batchOn(documentWith());
    batch.add(action("a"));
    batch.add(setName("renamed"));
    batch.undoOrRedo("UNDO", "global");

    expect(retracted(batch.actions)).toEqual(["a"]);

    const onlyBase = batchOn(documentWith());
    onlyBase.add(setName("renamed"));
    expect(() => onlyBase.undoOrRedo("UNDO", "global")).toThrow(
      NoUndoRedoTargetError,
    );
  });

  it("redoes the batch's own undos, latest first", () => {
    const batch = batchOn(documentWith(action("x"), action("y")));
    batch.undoOrRedo("UNDO", "global");
    batch.undoOrRedo("UNDO", "global");
    batch.undoOrRedo("REDO", "global");
    batch.undoOrRedo("REDO", "global");

    const [undoY, undoX, redoX, redoY] = batch.actions;
    expect(retracted([undoY, undoX])).toEqual(["y", "x"]);
    expect(retracted([redoX, redoY])).toEqual([undoX.id, undoY.id]);
  });

  it("redoes a stored undo, unless content added in the batch follows it", () => {
    const stored = documentWith(action("x"), R("x"));
    const batch = batchOn(stored);
    batch.undoOrRedo("REDO", "global");
    expect(retracted(batch.actions)).toEqual(["R(x)"]);

    const after = batchOn(stored);
    after.add(action("a"));
    expect(() => after.undoOrRedo("REDO", "global")).toThrow(
      NoUndoRedoTargetError,
    );
  });

  it("resolves each scope from its own rows", () => {
    const batch = batchOn(documentWith(action("x")));
    batch.add(action("l", "INC", "local"));
    batch.undoOrRedo("UNDO", "global");
    batch.undoOrRedo("UNDO", "local");

    expect(retracted(batch.actions)).toEqual(["x", "l"]);
    expect(batch.actions.map((act) => act.scope)).toEqual([
      "local",
      "global",
      "local",
    ]);
  });

  it("refuses with a typed error when nothing is left to undo", () => {
    const batch = batchOn(documentWith());
    batch.add(action("a"));
    batch.undoOrRedo("UNDO", "global");

    let error: unknown;
    try {
      batch.undoOrRedo("UNDO", "global");
    } catch (thrown) {
      error = thrown;
    }
    expect(NoUndoRedoTargetError.isError(error)).toBe(true);
    expect(error).toMatchObject({ actionType: "UNDO", scope: "global" });
    expect(() => batchOn(documentWith()).undoOrRedo("REDO", "global")).toThrow(
      "Cannot redo: nothing to redo in scope history",
    );
  });

  it("finds nothing to undo in a scope the rule does not derive", () => {
    const batch = batchOn(documentWith());
    batch.add(action("a", "INC", "document"));
    expect(() => batch.undoOrRedo("UNDO", "document")).toThrow(
      NoUndoRedoTargetError,
    );
  });

  it("serves base-reducer 3 only", () => {
    expect(() =>
      undoRedoBatch(documentWith(), capabilitiesOf(2), reducer),
    ).toThrow();
  });
});
