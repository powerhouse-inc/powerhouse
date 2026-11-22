import {
  acceptTask,
  addTask,
  addTaskDependency,
  addTaskOutcomeRef,
  assignTask,
  blockTask,
  reducer,
  rejectTask,
  removeTask,
  setTaskTargetSpec,
  submitTaskForReview,
  unblockTask,
  updateTaskTargetSpecSnippet,
  utils,
} from "document-models/work-breakdown-structure/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

const TS = "2026-05-29T10:00:00.000Z";

describe("Task operations", () => {
  it("adds tasks with defaults and rejects duplicates", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({
        id: "t1",
        name: "Build",
        taskKind: ["SPEC_CHANGE", "IMPLEMENTATION"],
      }),
    );
    const task = doc.state.global.tasks[0];
    expect(task.status).toBe("TODO");
    expect(task.taskKind).toEqual(["SPEC_CHANGE", "IMPLEMENTATION"]);
    expect(task.targetOutcomes).toEqual([]);
    expect(task.dependsOn).toEqual([]);
    expect(task.packageId).toBeNull();

    expect(
      failure(() =>
        reducer(doc, addTask({ id: "t1", name: "Dup", taskKind: ["TESTING"] })),
      ),
    ).toBeTruthy();
  });

  it("sets a target-spec snippet and outcome refs", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({ id: "t1", name: "Build", taskKind: ["IMPLEMENTATION"] }),
    );
    doc = reducer(
      doc,
      setTaskTargetSpec({
        taskId: "t1",
        documentId: "phd:spec:1",
        name: "Order model",
        kind: "data-model",
      }),
    );
    expect(doc.state.global.tasks[0].targetSpec?.kind).toBe("data-model");
    doc = reducer(
      doc,
      updateTaskTargetSpecSnippet({ taskId: "t1", name: "Order data model" }),
    );
    expect(doc.state.global.tasks[0].targetSpec?.name).toBe("Order data model");

    doc = reducer(
      doc,
      addTaskOutcomeRef({
        taskId: "t1",
        id: "or1",
        documentId: "phd:problem:1",
        objectId: "o1",
        statement: "Decrease time",
      }),
    );
    expect(doc.state.global.tasks[0].targetOutcomes[0].objectId).toBe("o1");
  });

  it("adds dependencies and rejects cycles within the document", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({ id: "t1", name: "A", taskKind: ["IMPLEMENTATION"] }),
    );
    doc = reducer(
      doc,
      addTask({ id: "t2", name: "B", taskKind: ["IMPLEMENTATION"] }),
    );
    // t2 depends on t1.
    doc = reducer(
      doc,
      addTaskDependency({
        taskId: "t2",
        id: "d1",
        documentId: "phd:wbs:self",
        objectId: "t1",
      }),
    );
    expect(
      doc.state.global.tasks.find((t) => t.id === "t2")?.dependsOn[0].objectId,
    ).toBe("t1");

    // t1 depends on t2 would close a cycle -> rejected.
    expect(
      failure(() =>
        reducer(
          doc,
          addTaskDependency({
            taskId: "t1",
            id: "d2",
            documentId: "phd:wbs:self",
            objectId: "t2",
          }),
        ),
      ),
    ).toBeTruthy();

    // A cross-document dependency (target not a local task) is allowed.
    doc = reducer(
      doc,
      addTaskDependency({
        taskId: "t1",
        id: "d3",
        documentId: "phd:wbs:other",
        objectId: "remote-task",
      }),
    );
    expect(
      doc.state.global.tasks.find((t) => t.id === "t1")?.dependsOn,
    ).toHaveLength(1);
  });

  it("walks the task lifecycle and enforces source states", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({ id: "t1", name: "Build", taskKind: ["IMPLEMENTATION"] }),
    );
    // Cannot submit for review from TODO.
    expect(
      failure(() => reducer(doc, submitTaskForReview({ taskId: "t1" }))),
    ).toBeTruthy();

    doc = reducer(
      doc,
      assignTask({
        taskId: "t1",
        documentId: "phd:session:1",
        agent: "impl",
        startedAt: TS,
      }),
    );
    expect(doc.state.global.tasks[0].status).toBe("IN_PROGRESS");
    expect(doc.state.global.tasks[0].session?.agent).toBe("impl");

    doc = reducer(doc, submitTaskForReview({ taskId: "t1" }));
    expect(doc.state.global.tasks[0].status).toBe("REVIEW");
    doc = reducer(doc, rejectTask({ taskId: "t1" }));
    expect(doc.state.global.tasks[0].status).toBe("IN_PROGRESS");

    doc = reducer(doc, blockTask({ taskId: "t1", reason: "Waiting on API." }));
    expect(doc.state.global.tasks[0].status).toBe("BLOCKED");
    doc = reducer(doc, unblockTask({ taskId: "t1" }));
    expect(doc.state.global.tasks[0].status).toBe("IN_PROGRESS");

    doc = reducer(doc, submitTaskForReview({ taskId: "t1" }));
    doc = reducer(doc, acceptTask({ taskId: "t1", completedAt: TS }));
    expect(doc.state.global.tasks[0].status).toBe("DONE");
    expect(doc.state.global.tasks[0].completedAt).toBe(TS);
  });

  it("removes a task", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({ id: "t1", name: "Build", taskKind: ["IMPLEMENTATION"] }),
    );
    doc = reducer(doc, removeTask({ id: "t1" }));
    expect(doc.state.global.tasks).toHaveLength(0);
  });
});
