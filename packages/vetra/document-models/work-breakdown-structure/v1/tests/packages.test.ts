import {
  addPackage,
  addTask,
  movePackage,
  moveTask,
  reducer,
  removePackage,
  reorderPackages,
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

describe("Package operations", () => {
  it("adds, nests one level, reorders and rejects too-deep nesting", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addPackage({ id: "p1", name: "Backend" }));
    doc = reducer(
      doc,
      addPackage({ id: "p2", name: "API", parentPackageId: "p1" }),
    );
    expect(
      doc.state.global.packages.find((p) => p.id === "p2")?.parentPackageId,
    ).toBe("p1");

    // p2 is already nested; nesting p3 under p2 is two levels deep -> reject.
    expect(
      failure(() =>
        reducer(
          doc,
          addPackage({ id: "p3", name: "Routes", parentPackageId: "p2" }),
        ),
      ),
    ).toBeTruthy();

    doc = reducer(doc, addPackage({ id: "p4", name: "Frontend" }));
    doc = reducer(doc, reorderPackages({ ids: ["p4"], insertBefore: "p1" }));
    expect(doc.state.global.packages.map((p) => p.id)).toEqual([
      "p4",
      "p1",
      "p2",
    ]);
  });

  it("reparents tasks to unscoped and child packages to top-level on removal", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addPackage({ id: "p1", name: "Backend" }));
    doc = reducer(
      doc,
      addPackage({ id: "p2", name: "API", parentPackageId: "p1" }),
    );
    doc = reducer(
      doc,
      addTask({
        id: "t1",
        name: "Build",
        taskKind: ["IMPLEMENTATION"],
        packageId: "p1",
      }),
    );

    doc = reducer(doc, removePackage({ id: "p1" }));
    expect(doc.state.global.packages.map((p) => p.id)).toEqual(["p2"]);
    expect(
      doc.state.global.packages.find((p) => p.id === "p2")?.parentPackageId,
    ).toBeNull();
    expect(
      doc.state.global.tasks.find((t) => t.id === "t1")?.packageId,
    ).toBeNull();
  });

  it("rejects moving a task into a non-existent package", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTask({ id: "t1", name: "Build", taskKind: ["IMPLEMENTATION"] }),
    );
    expect(
      failure(() => reducer(doc, moveTask({ id: "t1", packageId: "nope" }))),
    ).toBeTruthy();
  });
});
