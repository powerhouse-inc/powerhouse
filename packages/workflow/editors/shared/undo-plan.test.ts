import type { Action, Operation } from "@powerhousedao/shared/document-model";
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
