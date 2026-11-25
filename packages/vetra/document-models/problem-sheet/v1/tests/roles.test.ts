import {
  addRole,
  addSpecializedJobStep,
  clearRoleSpecializedJob,
  reducer,
  removeRole,
  removeSpecializedJobStep,
  reorderRoles,
  reorderSpecializedJobSteps,
  setRoleSpecializedJob,
  updateRole,
  updateRoleSpecializedJob,
  updateSpecializedJobStep,
  utils,
} from "document-models/problem-sheet/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("Role operations", () => {
  it("adds, updates, reorders and removes roles", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addRole({ id: "r1", name: "Treasurer", kind: "PRIMARY" }),
    );
    doc = reducer(
      doc,
      addRole({ id: "r2", name: "Resident", kind: "PRIMARY" }),
    );
    expect(doc.state.global.roles.map((r) => r.id)).toEqual(["r1", "r2"]);

    doc = reducer(
      doc,
      updateRole({ id: "r1", name: "Group Treasurer", kind: "SUPPORT" }),
    );
    expect(doc.state.global.roles[0].name).toBe("Group Treasurer");
    expect(doc.state.global.roles[0].kind).toBe("SUPPORT");

    doc = reducer(doc, reorderRoles({ ids: ["r2"], insertBefore: "r1" }));
    expect(doc.state.global.roles.map((r) => r.id)).toEqual(["r2", "r1"]);

    doc = reducer(doc, removeRole({ id: "r2" }));
    expect(doc.state.global.roles.map((r) => r.id)).toEqual(["r1"]);
  });

  it("rejects a duplicate role id", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addRole({ id: "r1", name: "A", kind: "PRIMARY" }));
    expect(
      failure(() =>
        reducer(doc, addRole({ id: "r1", name: "B", kind: "PRIMARY" })),
      ),
    ).toBeTruthy();
  });

  it("manages a specialized job and its steps", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addRole({ id: "r1", name: "Treasurer", kind: "PRIMARY" }),
    );
    doc = reducer(
      doc,
      setRoleSpecializedJob({
        roleId: "r1",
        motivation: "HAVE_TO",
        verb: "close out",
        object: "the monthly books",
      }),
    );
    expect(doc.state.global.roles[0].specializedJob?.verb).toBe("close out");
    expect(doc.state.global.roles[0].specializedJob?.steps).toEqual([]);

    doc = reducer(
      doc,
      addSpecializedJobStep({
        roleId: "r1",
        id: "ss1",
        name: "Reconcile",
        category: "EXECUTE",
      }),
    );
    doc = reducer(
      doc,
      addSpecializedJobStep({
        roleId: "r1",
        id: "ss2",
        name: "Report",
        category: "CONCLUDE",
      }),
    );
    expect(
      doc.state.global.roles[0].specializedJob?.steps.map((s) => s.id),
    ).toEqual(["ss1", "ss2"]);

    doc = reducer(
      doc,
      reorderSpecializedJobSteps({
        roleId: "r1",
        ids: ["ss2"],
        insertBefore: "ss1",
      }),
    );
    expect(
      doc.state.global.roles[0].specializedJob?.steps.map((s) => s.id),
    ).toEqual(["ss2", "ss1"]);

    doc = reducer(
      doc,
      updateSpecializedJobStep({
        roleId: "r1",
        id: "ss1",
        name: "Reconcile accounts",
      }),
    );
    expect(
      doc.state.global.roles[0].specializedJob?.steps.find(
        (s) => s.id === "ss1",
      )?.name,
    ).toBe("Reconcile accounts");

    doc = reducer(doc, removeSpecializedJobStep({ roleId: "r1", id: "ss2" }));
    expect(
      doc.state.global.roles[0].specializedJob?.steps.map((s) => s.id),
    ).toEqual(["ss1"]);

    doc = reducer(
      doc,
      updateRoleSpecializedJob({ roleId: "r1", clarifier: "every month" }),
    );
    expect(doc.state.global.roles[0].specializedJob?.clarifier).toBe(
      "every month",
    );

    doc = reducer(doc, clearRoleSpecializedJob({ roleId: "r1" }));
    expect(doc.state.global.roles[0].specializedJob).toBeNull();
  });

  it("rejects specialized-job step ops when no specialized job is set", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addRole({ id: "r1", name: "Resident", kind: "PRIMARY" }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addSpecializedJobStep({
            roleId: "r1",
            id: "ss1",
            name: "x",
            category: "DEFINE",
          }),
        ),
      ),
    ).toBeTruthy();
    expect(
      failure(() =>
        reducer(doc, updateRoleSpecializedJob({ roleId: "r1", verb: "x" })),
      ),
    ).toBeTruthy();
  });

  it("rejects operations on an unknown role", () => {
    const doc = utils.createDocument();
    expect(
      failure(() =>
        reducer(
          doc,
          setRoleSpecializedJob({
            roleId: "nope",
            motivation: "WANT_TO",
            verb: "x",
            object: "y",
          }),
        ),
      ),
    ).toBeTruthy();
  });
});
