import {
  acceptTask,
  activateWbs,
  addTask,
  archiveWbs,
  assignTask,
  completeWbs,
  dropTask,
  reducer,
  reopenWbs,
  submitTaskForReview,
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

describe("WBS status transitions", () => {
  it("defaults DRAFT, activates, and rejects invalid transitions", () => {
    const doc = utils.createDocument();
    expect(doc.state.global.status).toBe("DRAFT");
    // Cannot complete from DRAFT.
    expect(failure(() => reducer(doc, completeWbs({})))).toBeTruthy();

    const active = reducer(doc, activateWbs({}));
    expect(active.state.global.status).toBe("ACTIVE");
    // Cannot activate twice.
    expect(failure(() => reducer(active, activateWbs({})))).toBeTruthy();
  });

  it("blocks completion until every task is DONE or DROPPED", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({ id: "t1", name: "Build", taskKind: ["IMPLEMENTATION"] }),
    );
    doc = reducer(
      doc,
      addTask({ id: "t2", name: "Spike", taskKind: ["IMPLEMENTATION"] }),
    );
    doc = reducer(doc, activateWbs({}));
    // Tasks still TODO -> cannot complete.
    expect(failure(() => reducer(doc, completeWbs({})))).toBeTruthy();

    doc = reducer(
      doc,
      assignTask({ taskId: "t1", documentId: "phd:session:1", startedAt: TS }),
    );
    doc = reducer(doc, submitTaskForReview({ taskId: "t1" }));
    doc = reducer(doc, acceptTask({ taskId: "t1", completedAt: TS }));
    doc = reducer(doc, dropTask({ taskId: "t2", reason: "Out of scope." }));
    doc = reducer(doc, completeWbs({}));
    expect(doc.state.global.status).toBe("COMPLETE");
  });

  it("archives and reopens", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, archiveWbs({}));
    expect(doc.state.global.status).toBe("ARCHIVED");
    doc = reducer(doc, reopenWbs({}));
    expect(doc.state.global.status).toBe("ACTIVE");
  });
});
