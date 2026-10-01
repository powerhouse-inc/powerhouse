import {
  deriveScope,
  undoTarget,
  type Action,
  type Operation,
  type PHDocument,
  type PHDocumentHeader,
  type StateReducer,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  editedSince,
  effectiveOperations,
  groupedAction,
  headIndex,
  newUndoGroup,
  planUndo,
  redoAction,
  redoActions,
  undoGroupOf,
  undoProtocolVersion,
  type UndoPolicy,
} from "./undo-plan.js";

function op(
  index: number,
  type: string,
  extra: Partial<Operation> = {},
): Operation {
  return {
    id: `op-${index}`,
    index,
    skip: type === "NOOP" ? 1 : 0,
    timestampUtcMs: new Date(index * 1000).toISOString(),
    hash: "",
    action: {
      id: `action-${index}`,
      type,
      input: { n: index },
      scope: "global",
      timestampUtcMs: new Date(index * 1000).toISOString(),
    },
    ...extra,
  } as Operation;
}

const policy: UndoPolicy = {
  skip: new Set(["SET_LAST_TEST", "SET_LAST_RUN"]),
  replay: (action) =>
    action.type === "SET_LAST_TEST"
      ? ({ ...action, id: `again-${action.id}` } as Action)
      : undefined,
};

describe("planUndo", () => {
  it("undoes the last edit when nothing follows it", () => {
    const ops = [op(0, "ADD_STEP"), op(1, "SET_STEP_CONFIG")];
    expect(planUndo(ops, policy)).toEqual({
      undos: 1,
      replay: [],
      undone: [ops[1].action],
    });
  });

  it("passes over skipped operations written after the edit", () => {
    const ops = [
      op(0, "ADD_STEP"),
      op(1, "SET_STEP_CONFIG"),
      op(2, "SET_LAST_RUN"),
    ];
    expect(planUndo(ops, policy)).toMatchObject({ undos: 2, replay: [] });
    expect(planUndo(ops, policy)?.undone.map((a) => a.type)).toEqual([
      "SET_STEP_CONFIG",
    ]);
  });

  it("writes a runtime fact again rather than losing it", () => {
    const ops = [
      op(0, "SET_STEP_CONFIG"),
      op(1, "SET_LAST_TEST"),
      op(2, "SET_LAST_RUN"),
    ];
    const plan = planUndo(ops, policy);
    expect(plan?.undos).toBe(3);
    expect(plan?.replay.map((action) => action.id)).toEqual(["again-action-1"]);
  });

  it("hands the replay the edit it takes back, so it can drop a fact of it", () => {
    const ops = [
      op(0, "ADD_STEP"),
      op(1, "SET_LAST_TEST"),
      op(2, "SET_LAST_RUN"),
    ];
    const seen: Action[][] = [];
    const plan = planUndo(ops, {
      ...policy,
      replay: (action, undone) => {
        seen.push([...undone]);
        return action.type === "SET_LAST_RUN" ? action : undefined;
      },
    });
    expect(seen).toEqual([[ops[0].action], [ops[0].action]]);
    expect(plan?.replay.map((action) => action.type)).toEqual(["SET_LAST_RUN"]);
  });

  it("passes over failed operations", () => {
    const ops = [
      op(0, "SET_STEP_CONFIG"),
      op(1, "UPDATE_STEP", { error: "Step not found" }),
    ];
    expect(planUndo(ops, policy)?.undos).toBe(2);
  });

  it("has nothing to undo when only skipped operations are left", () => {
    expect(planUndo([op(0, "SET_LAST_RUN")], policy)).toBeNull();
    expect(planUndo([], policy)).toBeNull();
  });
});

describe("grouped edits", () => {
  const inGroup = (operation: Operation, group: string): Operation => ({
    ...operation,
    action: groupedAction(operation.action, group),
  });

  it("undoes an add and its follow-up together, facts in between replayed", () => {
    const group = newUndoGroup();
    const ops = [
      op(0, "SET_WORKFLOW_NAME"),
      inGroup(op(1, "ADD_STEP"), group),
      inGroup(op(2, "ADD_EDGE"), group),
      op(3, "SET_LAST_TEST"),
      inGroup(op(4, "SET_STEP_CONFIG"), group),
    ];
    const plan = planUndo(ops, policy);
    expect(plan?.undos).toBe(4);
    expect(plan?.undone.map((action) => action.type)).toEqual([
      "ADD_STEP",
      "ADD_EDGE",
      "SET_STEP_CONFIG",
    ]);
    expect(plan?.replay).toHaveLength(1);
  });

  it("stops at an edit of another group or none", () => {
    const ops = [
      inGroup(op(0, "ADD_STEP"), "a"),
      op(1, "SET_STEP_CONFIG"),
      inGroup(op(2, "ADD_STEP"), "b"),
    ];
    expect(planUndo(ops, policy)).toMatchObject({ undos: 1 });
    expect(planUndo(ops.slice(0, 2), policy)).toMatchObject({ undos: 1 });
  });

  it("reads the group back off the action id only", () => {
    const action = groupedAction(op(0, "ADD_STEP").action, "g1");
    expect(undoGroupOf(action)).toBe("g1");
    expect(undoGroupOf(op(0, "ADD_STEP").action)).toBeUndefined();
  });

  it("redoes a group as a new group of fresh actions", () => {
    const actions = [
      groupedAction(op(0, "ADD_STEP").action, "g1"),
      groupedAction(op(1, "ADD_EDGE").action, "g1"),
    ];
    const again = redoActions(actions);
    const groups = new Set(again.map(undoGroupOf));
    expect(groups.size).toBe(1);
    expect(groups.has("g1")).toBe(false);
    expect(again.map((action) => action.type)).toEqual([
      "ADD_STEP",
      "ADD_EDGE",
    ]);
  });
});

describe("effectiveOperations", () => {
  it("drops what earlier undos took back", () => {
    // Two NOOPs undo the run record and the edit before it.
    const ops = [
      op(0, "ADD_STEP"),
      op(1, "SET_STEP_CONFIG"),
      op(2, "SET_LAST_RUN"),
      op(3, "NOOP"),
      op(4, "NOOP"),
    ];
    expect(
      effectiveOperations(ops, 2).map((entry) => entry.action.type),
    ).toEqual(["ADD_STEP"]);
    // So the next undo reaches the step itself.
    expect(planUndo(effectiveOperations(ops, 2), policy)?.undos).toBe(1);
  });
});

describe("effectiveOperations on base-reducer 3", () => {
  // Skip is only a reshuffle's rewind on base-reducer 3, so 0 on every row.
  const row = (index: number, type: string, extra: Partial<Operation> = {}) =>
    op(index, type, { skip: 0, ...extra });
  const retraction = (index: number, target: string): Operation => {
    const base = row(index, "RETRACT");
    return { ...base, action: { ...base.action, input: { target } } };
  };
  const ids = (operations: readonly Operation[]) =>
    operations.map((operation) => operation.action.id);

  // FAIL throws, as an action whose precondition no longer holds does.
  const reducer: StateReducer = (state, action) => {
    if (action.type === "FAIL") throw new Error("fails");
    return state;
  };
  const appliedOf = (stream: readonly Operation[]) =>
    deriveScope(
      {
        header: { id: "doc" },
        state: { global: {} },
        initialState: { global: {} },
        operations: {},
        clipboard: [],
      } as unknown as PHDocument,
      stream,
      () => reducer,
      "global",
    ).applied;
  const effective = (stream: readonly Operation[]) =>
    effectiveOperations(stream, 3, appliedOf(stream));

  // Dispatches `count` UNDOs as the reducer resolves them, returning the
  // targets in the order they were retracted.
  const undoTargets = (stream: readonly Operation[], count: number) => {
    const next = [...stream];
    const targets: string[] = [];
    for (let i = 0; i < count; i++) {
      const target = undoTarget(next, appliedOf(next));
      if (target === undefined) break;
      targets.push(target);
      next.push(retraction(headIndex(next) + 1, target));
    }
    return targets;
  };

  it("keeps plain content and undoes the last edit with one UNDO", () => {
    const ops = [row(0, "ADD_STEP"), row(1, "SET_STEP_CONFIG")];
    expect(ids(effective(ops))).toEqual(["action-0", "action-1"]);
    expect(planUndo(effective(ops), policy)).toMatchObject({
      undos: 1,
      undone: [ops[1].action],
    });
  });

  it("drops retracted rows and the RETRACTs themselves", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_STEP_CONFIG"),
      retraction(2, "action-1"),
    ];
    expect(ids(effective(ops))).toEqual(["action-0"]);
    expect(planUndo(effective(ops), policy)?.undone).toEqual([ops[0].action]);
  });

  it("keeps a row a redo revived", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_STEP_CONFIG"),
      retraction(2, "action-1"),
      retraction(3, "action-2"),
    ];
    expect(ids(effective(ops))).toEqual(["action-0", "action-1"]);
    expect(planUndo(effective(ops), policy)).toMatchObject({
      undos: 1,
      undone: [ops[1].action],
    });
    expect(undoTargets(ops, 1)).toEqual(["action-1"]);
  });

  it("drops denied rows, and a denied RETRACT retracts nothing", () => {
    const denied = { deniedReason: "no grant permits this operation" };
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_STEP_CONFIG", denied),
      row(2, "UPDATE_STEP"),
      { ...retraction(3, "action-2"), ...denied },
    ];
    expect(ids(effective(ops))).toEqual(["action-0", "action-2"]);
    expect(undoTargets(ops, 2)).toEqual(["action-2", "action-0"]);
  });

  it("drops NOOPs without letting them retract anything", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "NOOP"),
      row(2, "SET_STEP_CONFIG"),
      row(3, "NOOP"),
    ];
    expect(ids(effective(ops))).toEqual(["action-0", "action-2"]);
    expect(planUndo(effective(ops), policy)?.undos).toBe(1);
    expect(undoTargets(ops, 1)).toEqual(["action-2"]);
  });

  it("drops a row that does not apply, so no UNDO is spent on it", () => {
    const ops = [row(0, "ADD_STEP"), row(1, "SET_STEP_CONFIG"), row(2, "FAIL")];
    expect(ids(effective(ops))).toEqual(["action-0", "action-1"]);
    expect(planUndo(effective(ops), policy)?.undos).toBe(1);
  });

  it("reads which rows apply from `applied`, not a stored error", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_STEP_CONFIG", { error: "Step not found" }),
    ];
    const both = new Set(["action-0", "action-1"]);
    expect(effectiveOperations(ops, 3, both)).toEqual([
      ops[0],
      { ...ops[1], error: undefined },
    ]);
    // Without a reducer to derive `applied`, the stored error decides.
    expect(ids(effectiveOperations(ops, 3))).toEqual(["action-0"]);
  });

  it("plans one UNDO per row the edit and the facts after it retract", () => {
    const group = newUndoGroup();
    const inGroup = (operation: Operation): Operation => ({
      ...operation,
      action: groupedAction(operation.action, group),
    });
    const ops = [
      row(0, "SET_WORKFLOW_NAME"),
      inGroup(row(1, "ADD_STEP")),
      row(2, "FAIL"),
      inGroup(row(3, "ADD_EDGE")),
      row(4, "SET_LAST_TEST"),
      row(5, "SET_LAST_RUN"),
    ];
    const plan = planUndo(effective(ops), policy);
    expect(plan?.undos).toBe(4);
    expect(plan?.undone.map((action) => action.type)).toEqual([
      "ADD_STEP",
      "ADD_EDGE",
    ]);
    expect(plan?.replay.map((action) => action.type)).toEqual([
      "SET_LAST_TEST",
    ]);
    expect(undoTargets(ops, plan!.undos)).toEqual(
      [ops[5], ops[4], ops[3], ops[1]].map((entry) => entry.action.id),
    );
  });

  it("leaves base-reducer 1 and 2 alone when given `applied`", () => {
    const ops = [
      op(0, "ADD_STEP"),
      op(1, "SET_STEP_CONFIG", { error: "Step not found" }),
      op(2, "NOOP"),
      op(3, "UPDATE_STEP"),
    ];
    for (const version of [1, 2] as const) {
      expect(effectiveOperations(ops, version, new Set())).toEqual(
        effectiveOperations(ops, version),
      );
    }
  });
});

describe("redo", () => {
  it("is voided by an author edit after the head, not by undos or facts", () => {
    const ops = [
      op(0, "SET_STEP_CONFIG"),
      op(1, "NOOP"),
      op(2, "SET_LAST_RUN"),
    ];
    expect(headIndex(ops)).toBe(2);
    expect(editedSince(ops, 0, policy)).toBe(false);
    expect(editedSince([...ops, op(3, "UPDATE_STEP")], 2, policy)).toBe(true);
    expect(editedSince([...ops, op(3, "UPDATE_STEP")], 3, policy)).toBe(false);
  });

  it("dispatches the undone edit again as a fresh action", () => {
    const undone = op(4, "SET_STEP_CONFIG").action;
    const again = redoAction(undone);
    expect(again).toMatchObject({
      type: undone.type,
      scope: undone.scope,
      input: undone.input,
    });
    expect(again.id).not.toBe(undone.id);
  });
});

describe("undoProtocolVersion", () => {
  const header = (protocolVersions?: Record<string, number>) =>
    ({ id: "doc", protocolVersions }) as PHDocumentHeader;

  it("reads a header without a base-reducer version as 1", () => {
    expect(undoProtocolVersion(header())).toBe(1);
    expect(undoProtocolVersion(header({}))).toBe(1);
  });

  it("reads a known version", () => {
    expect(undoProtocolVersion(header({ "base-reducer": 2 }))).toBe(2);
  });

  it("refuses an unknown version", () => {
    expect(() => undoProtocolVersion(header({ "base-reducer": 7 }))).toThrow(
      "unknown base-reducer protocol version 7",
    );
  });
});
