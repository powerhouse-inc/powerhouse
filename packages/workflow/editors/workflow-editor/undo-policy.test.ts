// The workflow editor's undo, planned from and applied to a real document.
import { undo, type Action } from "@powerhousedao/shared/document-model";
import {
  actions,
  reducer,
  utils,
  type WorkflowDocument,
} from "document-models/workflow";
import { describe, expect, it } from "vitest";
import { effectiveOperations, planUndo } from "../shared/undo-plan.js";
import { WORKFLOW_UNDO } from "./undo-policy.js";

const CORE = "@powerhousedao/piece-core";

function apply(document: WorkflowDocument, ...list: Action[]) {
  for (const action of list) document = reducer(document, action as never);
  return document;
}

const addStep = (id: string) =>
  actions.addStep({
    id,
    key: id,
    name: id,
    pieceName: CORE,
    pieceVersion: "1.0.0",
    actionName: "branch",
    config: {},
  });

const setTrigger = (id: string) =>
  actions.setTrigger({
    id,
    pieceName: CORE,
    pieceVersion: "1.0.0",
    triggerName: "manual",
    config: {},
  });

const tested = (id: string) =>
  actions.setLastTest({
    id,
    runId: `run-${id}`,
    testedAt: "2026-09-29T12:00:00.000Z",
  });

// Plans the next undo and applies it the way the editor dispatches it.
function undoOnce(document: WorkflowDocument) {
  const plan = planUndo(
    effectiveOperations(document.operations.global, 1),
    WORKFLOW_UNDO,
  );
  if (!plan) throw new Error("nothing to undo");
  const before = document.operations.global.length;
  const next = apply(
    document,
    ...Array.from({ length: plan.undos }, () => undo()),
    ...plan.replay,
  );
  const errors = next.operations.global
    .slice(before)
    .map((operation) => operation.error)
    .filter(Boolean);
  return { plan, document: next, errors };
}

describe("the workflow editor's undo", () => {
  it("drops the test of a step the undo removes", () => {
    const document = apply(
      utils.createDocument(),
      setTrigger("t1"),
      addStep("s1"),
      tested("s1"),
    );

    const { plan, document: undone, errors } = undoOnce(document);

    expect(plan.undone.map((action) => action.type)).toEqual(["ADD_STEP"]);
    expect(plan.replay).toEqual([]);
    expect(errors).toEqual([]);
    expect(undone.state.global.steps).toEqual([]);
  });

  it("drops the test of a trigger the undo takes back", () => {
    const document = apply(
      utils.createDocument(),
      setTrigger("t1"),
      tested("t1"),
    );

    const { plan, errors } = undoOnce(document);

    expect(plan.replay).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("keeps the test of a block the undo leaves in place", () => {
    const document = apply(
      utils.createDocument(),
      setTrigger("t1"),
      addStep("s1"),
      addStep("s2"),
      tested("s1"),
    );

    const { plan, document: undone, errors } = undoOnce(document);

    expect(plan.replay.map((action) => action.type)).toEqual(["SET_LAST_TEST"]);
    expect(errors).toEqual([]);
    expect(undone.state.global.steps.map((step) => step.id)).toEqual(["s1"]);
    expect(undone.state.global.steps[0]?.lastTest?.runId).toBe("run-s1");
  });
});
