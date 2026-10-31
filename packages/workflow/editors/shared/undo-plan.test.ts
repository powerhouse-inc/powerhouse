import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  appliedOperations,
  capabilitiesOf,
  compareActionIds,
  creationActions,
  generateActionId,
  stateReducerOf,
  undoRedoTargetsOf,
  undoTarget,
  type PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import {
  addStep,
  removeStep,
  reducer as workflowReducer,
  setStepConfig,
  setWorkflowName,
  utils as workflowUtils,
} from "document-models/workflow";
import { describe, expect, it } from "vitest";
import {
  appliedActionIds,
  canUndoOn3,
  documentCapabilities,
  editedSince,
  effectiveOperations,
  groupedAction,
  headIndex,
  isRetractionDocument,
  liveOperations,
  newUndoGroup,
  planRetraction,
  planUndo,
  redoAction,
  redoActions,
  retractions,
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

const V2 = capabilitiesOf(2);
const V3 = capabilitiesOf(3);
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("grouped ids by base-reducer", () => {
  it("reads the group of an id stored with the old prefix", () => {
    const action = { ...op(0, "ADD_STEP").action, id: "undo-group:g1:x" };
    expect(undoGroupOf(action)).toBe("g1");
  });

  it("keeps the undo-group prefix and UUIDv4 ids below base-reducer 3", () => {
    for (const caps of [undefined, capabilitiesOf(1), V2]) {
      const group = newUndoGroup(caps);
      expect(group).toMatch(UUID_V4);
      const grouped = groupedAction(op(0, "ADD_STEP").action, group, caps);
      const [prefix, inGroup, id] = grouped.id.split(":");
      expect(prefix).toBe("undo-group");
      expect(inGroup).toBe(group);
      expect(id).toMatch(UUID_V4);
      expect(undoGroupOf(grouped)).toBe(group);
    }
  });

  it("redoes with UUIDv4 ids below base-reducer 3", () => {
    const actions = [
      groupedAction(op(0, "ADD_STEP").action, "g1", V2),
      groupedAction(op(1, "ADD_EDGE").action, "g1", V2),
    ];
    expect(redoAction(actions[0], V2).id).toMatch(UUID_V4);
    const again = redoActions(actions, V2);
    expect(again.every((action) => action.id.startsWith("undo-group:"))).toBe(
      true,
    );
    expect(again.map((action) => action.id.split(":")[2])).toSatisfy(
      (ids: string[]) => ids.every((id) => UUID_V4.test(id)),
    );
  });

  it("leads a grouped id with a fresh action id on base-reducer 3, so it sorts by creation", () => {
    const group = newUndoGroup(V3);
    expect(group).toMatch(UUID_V7);
    const grouped = groupedAction(op(0, "ADD_STEP").action, group, V3);
    const plain = generateActionId();
    expect(compareActionIds(grouped.id, plain)).toBe(-1);
    expect(grouped.id).toBe(`${grouped.id.split("~ug:")[0]}~ug:${group}`);
    expect(grouped.id.split("~ug:")[0]).toMatch(UUID_V7);
    expect(undoGroupOf(grouped)).toBe(group);
  });

  it("redoes with UUIDv7 ids on base-reducer 3", () => {
    const actions = [
      groupedAction(op(0, "ADD_STEP").action, "g1", V3),
      groupedAction(op(1, "ADD_EDGE").action, "g1", V3),
    ];
    expect(redoAction(actions[0], V3).id).toMatch(UUID_V7);
    const again = redoActions(actions, V3);
    const groups = new Set(again.map(undoGroupOf));
    expect(groups.size).toBe(1);
    expect(groups.has("g1")).toBe(false);
    expect(again[0].id.split("~ug:")[0]).toMatch(UUID_V7);
  });
});

describe("planRetraction on base-reducer 3", () => {
  // Skip is only a reshuffle's rewind on base-reducer 3, so 0 on every row.
  const row = (index: number, type: string, extra: Partial<Operation> = {}) =>
    op(index, type, { skip: 0, ...extra });
  const retraction = (index: number, target: string): Operation => {
    const base = row(index, "RETRACT");
    return { ...base, action: { ...base.action, input: { target } } };
  };
  const ids = (operations: readonly Operation[]) =>
    operations.map((operation) => operation.action.id);
  // The rows that apply when no action throws.
  const every = (operations: readonly Operation[]) =>
    new Set(ids(appliedOperations(operations)));
  const grouped = (operation: Operation, group: string): Operation => ({
    ...operation,
    action: groupedAction(operation.action, group, V3),
  });
  // Appends one RETRACT per target, as the batch the editor sends lands.
  const land = (stream: readonly Operation[], targets: readonly string[]) => {
    const next = [...stream];
    for (const target of targets) {
      next.push(retraction(headIndex(next) + 1, target));
    }
    return next;
  };

  it("retracts the last edit by id", () => {
    const ops = [row(0, "ADD_STEP"), row(1, "SET_STEP_CONFIG")];
    expect(ids(liveOperations(ops))).toEqual(["action-0", "action-1"]);
    expect(planRetraction(ops, policy, every(ops))).toEqual(["action-1"]);
  });

  it("drops retracted rows and the RETRACTs themselves", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_STEP_CONFIG"),
      retraction(2, "action-1"),
    ];
    expect(ids(liveOperations(ops))).toEqual(["action-0"]);
    expect(planRetraction(ops, policy, every(ops))).toEqual(["action-0"]);
  });

  it("keeps a row a redo revived", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_STEP_CONFIG"),
      retraction(2, "action-1"),
      retraction(3, "action-2"),
    ];
    expect(ids(liveOperations(ops))).toEqual(["action-0", "action-1"]);
    expect(planRetraction(ops, policy, every(ops))).toEqual(["action-1"]);
  });

  it("passes over denied rows, NOOPs and the runtime's facts", () => {
    const denied = { deniedReason: "no grant permits this operation" };
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "UPDATE_STEP"),
      row(2, "SET_STEP_CONFIG", denied),
      row(3, "NOOP"),
      row(4, "SET_LAST_TEST"),
      row(5, "SET_LAST_RUN"),
    ];
    expect(planRetraction(ops, policy, every(ops))).toEqual(["action-1"]);
  });

  it("never retracts a base action", () => {
    const ops = [
      row(0, "ADD_STEP"),
      row(1, "SET_NAME"),
      row(2, "SET_PREFERRED_EDITOR"),
    ];
    expect(ids(liveOperations(ops))).toEqual(["action-0"]);
    expect(planRetraction(ops, policy, every(ops))).toEqual(["action-0"]);
  });

  it("retracts every live row of the last edit's group together", () => {
    const group = newUndoGroup(V3);
    const ops = [
      row(0, "SET_WORKFLOW_NAME"),
      grouped(row(1, "ADD_STEP"), group),
      row(2, "SET_LAST_TEST"),
      grouped(row(3, "ADD_EDGE"), group),
      row(4, "SET_LAST_RUN"),
    ];
    const targets = planRetraction(ops, policy, every(ops))!;
    expect(targets).toEqual([ops[1].action.id, ops[3].action.id]);
    const undone = land(ops, targets);
    expect(planRetraction(undone, policy, every(undone))).toEqual(["action-0"]);
  });

  // A rename sends SET_WORKFLOW_NAME, then SET_NAME, ungrouped.
  it("undoes a rename and then the grouped edit before it, as the reactor would", () => {
    const group = newUndoGroup(V3);
    const ops = [
      grouped(row(0, "ADD_STEP"), group),
      grouped(row(1, "ADD_EDGE"), group),
      row(2, "SET_WORKFLOW_NAME"),
      row(3, "SET_NAME"),
    ];
    const all = new Set(ids(ops));
    expect(planRetraction(ops, policy, every(ops))).toEqual(["action-2"]);
    expect(undoTarget(ops, all)).toBe("action-2");

    const after = land(ops, ["action-2"]);
    expect(planRetraction(after, policy, every(after))).toEqual([
      ops[0].action.id,
      ops[1].action.id,
    ]);
  });

  it("brings the edit back when redo retracts the undo's RETRACTs", () => {
    const group = newUndoGroup(V3);
    const ops = [
      row(0, "SET_WORKFLOW_NAME"),
      grouped(row(1, "ADD_STEP"), group),
      grouped(row(2, "ADD_EDGE"), group),
    ];
    const targets = planRetraction(ops, policy, every(ops))!;
    const undone = land(ops, targets);
    expect(ids(liveOperations(undone))).toEqual(["action-0"]);

    const undoRows = undone.slice(ops.length).map((entry) => entry.action.id);
    const redone = land(undone, undoRows);
    expect(ids(liveOperations(redone))).toEqual(ids(ops));
    expect(planRetraction(redone, policy, every(redone))).toEqual(targets);
  });

  it("can undo while a live edit is left", () => {
    const ops = [row(0, "ADD_STEP"), row(1, "SET_LAST_RUN")];
    const noop = [...ops, row(2, "NOOP")];
    const retracted = [...ops, retraction(2, "action-0")];
    expect(canUndoOn3(noop, policy, every(noop))).toBe(true);
    expect(canUndoOn3(retracted, policy, every(retracted))).toBe(false);
    expect(canUndoOn3([], policy, every([]))).toBe(false);
  });

  // The workflow model's own reducer decides which rows apply.
  describe("with the workflow reducer", () => {
    const stateReducer = stateReducerOf(workflowReducer)!;
    const created = workflowUtils.createDocument();
    const documentScope = creationActions(created, {
      "base-reducer": 3,
    }).map((action, index) => ({
      ...op(index, action.type, { skip: 0 }),
      action,
    }));
    const stored = (
      index: number,
      action: Action,
      extra: Partial<Operation> = {},
    ): Operation => ({
      ...op(index, action.type, { skip: 0 }),
      action,
      ...extra,
    });
    const step = (id: string) =>
      addStep({
        id,
        key: id,
        name: id,
        pieceName: "@acme/connector-http",
        pieceVersion: "1.0.0",
        actionName: "http.sendRequest",
        config: {},
      });
    const configure = (id: string) => setStepConfig({ id, config: { n: 1 } });
    const threw = { error: "Step not found" };
    const applied = (ops: readonly Operation[]) =>
      appliedActionIds(created, documentScope, ops, workflowReducer);
    // The target the reactor's UNDO retracts, derived from the same rows.
    const reactorTarget = (ops: readonly Operation[]) =>
      undoRedoTargetsOf(
        { ...created, operations: { ...created.operations, global: [...ops] } },
        V3,
        "global",
        stateReducer,
      ).undoTarget;

    it("retracts a row that threw once a RETRACT lets it apply", () => {
      const ops = [
        stored(0, step("x")),
        stored(1, removeStep({ id: "x" })),
        stored(2, configure("x"), threw),
      ];
      const after = [...ops, retraction(3, ops[1].action.id)];
      const config = ops[2].action.id;
      expect(applied(after).has(config)).toBe(true);
      expect(planRetraction(after, policy, applied(after))).toEqual([config]);
      expect(reactorTarget(after)).toBe(config);
      expect(canUndoOn3(after, policy, applied(after))).toBe(true);
    });

    it("passes over a row that still throws", () => {
      const ops = [stored(0, step("x")), stored(1, configure("y"), threw)];
      expect(applied(ops).has(ops[1].action.id)).toBe(false);
      expect(planRetraction(ops, policy, applied(ops))).toEqual([
        ops[0].action.id,
      ]);
      expect(reactorTarget(ops)).toBe(ops[0].action.id);
      expect(canUndoOn3([ops[1]], policy, applied([ops[1]]))).toBe(false);
    });

    it("retracts every row of the last group, one that threw too", () => {
      const group = newUndoGroup(V3);
      const ops = [
        stored(0, setWorkflowName({ name: "flow" })),
        stored(1, groupedAction(step("x"), group, V3)),
        stored(2, groupedAction(configure("y"), group, V3), threw),
      ];
      expect(applied(ops).has(ops[2].action.id)).toBe(false);
      expect(planRetraction(ops, policy, applied(ops))).toEqual([
        ops[1].action.id,
        ops[2].action.id,
      ]);
    });

    it("derives from the creation's state, not the cached initial state", () => {
      const ops = [stored(0, step("x"))];
      // The light client caches the current state as the initial one.
      const cached = workflowReducer(created, step("x"));
      const ids = appliedActionIds(
        { ...cached, initialState: cached.state },
        documentScope,
        ops,
        workflowReducer,
      );
      expect(ids.has(ops[0].action.id)).toBe(true);
    });
  });

  it("sends one RETRACT per id", () => {
    expect(
      retractions(["action-1", "action-2"]).map((action) => [
        action.type,
        action.scope,
        action.input,
      ]),
    ).toEqual([
      ["RETRACT", "global", { target: "action-1" }],
      ["RETRACT", "global", { target: "action-2" }],
    ]);
  });
});

describe("documentCapabilities", () => {
  const header = (protocolVersions?: Record<string, number>) =>
    ({ id: "doc", protocolVersions }) as PHDocumentHeader;
  const create = (input: unknown): Operation => {
    const base = op(0, "CREATE_DOCUMENT");
    return { ...base, action: { ...base.action, input } };
  };
  const createdAs = (version: number) =>
    create({ protocolVersions: { "base-reducer": version } });

  it("reads a known header version", () => {
    expect(documentCapabilities(header({ "base-reducer": 1 }))?.version).toBe(
      1,
    );
    expect(documentCapabilities(header({ "base-reducer": 2 }))?.version).toBe(
      2,
    );
    expect(documentCapabilities(header({ "base-reducer": 3 }))?.version).toBe(
      3,
    );
  });

  it("runs a number this build does not know as base-reducer 3", () => {
    expect(documentCapabilities(header({ "base-reducer": 7 }))?.version).toBe(
      3,
    );
    expect(isRetractionDocument(header({ "base-reducer": 7 }))).toBe(true);
  });

  it("reads a header without a version from CREATE_DOCUMENT, else names none", () => {
    expect(documentCapabilities(header())).toBeUndefined();
    expect(documentCapabilities(header(), create({}))).toBeUndefined();
    expect(documentCapabilities(header(), op(0, "ADD_STEP"))).toBeUndefined();
    expect(documentCapabilities(header(), createdAs(3))?.version).toBe(3);
    expect(
      documentCapabilities(header({ "base-reducer": 2 }), createdAs(3))
        ?.version,
    ).toBe(2);
  });

  it("retracts only on base-reducer 3", () => {
    expect(isRetractionDocument(header())).toBe(false);
    expect(isRetractionDocument(header(), createdAs(2))).toBe(false);
    expect(isRetractionDocument(header(), createdAs(3))).toBe(true);
    expect(isRetractionDocument(header({ "base-reducer": 1 }))).toBe(false);
    expect(isRetractionDocument(header({ "base-reducer": 2 }))).toBe(false);
    expect(isRetractionDocument(header({ "base-reducer": 3 }))).toBe(true);
  });
});
