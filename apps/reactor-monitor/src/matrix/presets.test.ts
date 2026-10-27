import { describe, expect, it } from "vitest";
import { CAPS, definition, hostExport, NO_PG } from "./__fixtures__/matrix.js";
import { valueAvailability } from "./builtins.js";
import { isRunnable, planMatrix } from "./compose.js";
import { checkEnvKey, checkSetterPath } from "./policy.js";
import {
  authLadderAxis,
  ladderFlags,
  storageAxis,
  workersAxis,
} from "./presets.js";
import { axisSchema, isDelete, type Axis } from "./schema.js";

const SWITCHBOARD = hostExport("switchboard");
const CONNECT = hostExport("connect");

function policyClean(axis: Axis): void {
  expect(axisSchema.parse(axis)).toEqual(axis);
  for (const value of axis.values) {
    for (const setter of value.setters) {
      const op = isDelete(setter.value) ? "delete" : "set";
      expect(checkSetterPath(setter.path, op), setter.path).toEqual({
        ok: true,
      });
    }
    for (const key of Object.keys(value.env)) {
      expect(checkEnvKey(key)).toEqual({ ok: true });
    }
  }
}

describe("authLadderAxis", () => {
  it("climbs five cumulative rungs", () => {
    expect([0, 1, 2, 3, 4].map(ladderFlags)).toEqual([
      {
        documentDecisions: false,
        authEnforcement: false,
        authGroups: false,
        authConditions: false,
      },
      {
        documentDecisions: true,
        authEnforcement: false,
        authGroups: false,
        authConditions: false,
      },
      {
        documentDecisions: true,
        authEnforcement: true,
        authGroups: false,
        authConditions: false,
      },
      {
        documentDecisions: true,
        authEnforcement: true,
        authGroups: true,
        authConditions: false,
      },
      {
        documentDecisions: true,
        authEnforcement: true,
        authGroups: true,
        authConditions: true,
      },
    ]);
  });

  it("sets featureFlags, never env", () => {
    const axis = authLadderAxis();
    policyClean(axis);
    expect(axis.key).toBe("auth");
    expect(axis.values.map((value) => [value.key, value.label])).toEqual([
      ["l0", "L0 no flags"],
      ["l1", "L1 documentDecisions"],
      ["l2", "L2 authEnforcement"],
      ["l3", "L3 authGroups"],
      ["l4", "L4 authConditions"],
    ]);
    expect(axis.values[2].setters).toEqual([
      { path: "host.reactor.protocol.featureFlags", value: ladderFlags(2) },
    ]);
    expect(
      axis.values.every((value) => Object.keys(value.env).length === 0),
    ).toBe(true);
  });

  it("takes rungs and subjects", () => {
    const axis = authLadderAxis({
      rungs: [0, 2],
      subjects: ["members.switchboard", "host.children.cli-connect"],
    });
    policyClean(axis);
    expect(axis.values.map((value) => value.key)).toEqual(["l0", "l2"]);
    expect(axis.values[1].setters.map((setter) => setter.path)).toEqual([
      "members.switchboard.reactor.protocol.featureFlags",
      "host.children.cli-connect.reactor.protocol.featureFlags",
    ]);
  });

  it("composes every rung cleanly on a switchboard", () => {
    const plan = planMatrix(
      definition({ axes: [authLadderAxis()] }),
      SWITCHBOARD,
      CAPS,
    );
    expect(
      plan.cells.map((cell) => [cell.id, isRunnable(cell), cell.combos]),
    ).toEqual(
      ["l0", "l1", "l2", "l3", "l4"].map((key) => [`auth=${key}`, true, []]),
    );
  });

  it("composes on a compound's members", () => {
    const axis = authLadderAxis({
      rungs: [4],
      subjects: ["members.switchboard", "host.children.cli-connect"],
    });
    const plan = planMatrix(
      definition({ axes: [axis] }),
      hostExport("cli"),
      CAPS,
    );
    expect(plan.cells[0]).toMatchObject({ issues: [], combos: [] });
  });
});

describe("workersAxis", () => {
  it("sets REACTOR_WORKERS", () => {
    const axis = workersAxis();
    policyClean(axis);
    expect(axis.values.map((value) => [value.key, value.env])).toEqual([
      ["w0", { REACTOR_WORKERS: "0" }],
      ["w2", { REACTOR_WORKERS: "2" }],
    ]);
    expect(workersAxis({ counts: [4] }).values[0].env).toEqual({
      REACTOR_WORKERS: "4",
    });
  });

  it("leaves workers without postgres to checkHost", () => {
    const def = definition({
      axes: [authLadderAxis({ rungs: [0, 2] }), workersAxis()],
    });
    const plan = planMatrix(def, SWITCHBOARD, NO_PG);
    expect(plan.cells.map((cell) => [cell.id, isRunnable(cell)])).toEqual([
      ["auth=l0,workers=w0", true],
      ["auth=l0,workers=w2", true],
      ["auth=l2,workers=w0", true],
      ["auth=l2,workers=w2", true],
    ]);
    expect(plan.cells[3].env).toEqual({ REACTOR_WORKERS: "2" });
    expect(plan.instances).toEqual({ remote: 4, browser: 0 });
  });
});

describe("storageAxis", () => {
  it("offers path, memory and postgres to controller cells", () => {
    const axis = storageAxis();
    policyClean(axis);
    expect(
      axis.values.map((value) => [value.key, value.requires, value.expect]),
    ).toEqual([
      ["path", [], { storageEngine: "pglite" }],
      ["memory", [], { storageEngine: "pglite" }],
      ["postgres", ["postgres"], { storageEngine: "postgres" }],
    ]);
    expect(axis.values[2].setters).toEqual([
      { path: "host.reactor.backends.main.kind", value: "in-process" },
      { path: "host.reactor.backends.main.storage.kind", value: "postgres" },
      {
        path: "host.reactor.backends.main.storage.dataDir",
        value: { $delete: true },
      },
      {
        path: "host.reactor.backends.main.storage.url",
        value: { $delete: true },
      },
    ]);
  });

  it("offers idb and memory to browser cells, as the attach kind", () => {
    const axis = storageAxis({ attach: "worker" });
    policyClean(axis);
    expect(axis.values.map((value) => value.key)).toEqual(["idb", "memory"]);
    expect(axis.values[0].setters[0]).toEqual({
      path: "host.reactor.backends.main.kind",
      value: "worker",
    });
  });

  it("composes on a switchboard, postgres only with the capability", () => {
    const def = definition({ axes: [storageAxis()] });
    const withPg = planMatrix(def, SWITCHBOARD, CAPS).cells;
    expect(
      withPg.map((cell) => [
        cell.id,
        isRunnable(cell),
        cell.requires,
        cell.storageEngine,
      ]),
    ).toEqual([
      ["storage=path", true, [], "pglite"],
      ["storage=memory", true, [], "pglite"],
      ["storage=postgres", true, ["postgres"], "postgres"],
    ]);
    expect(withPg[2].envelope?.host).toMatchObject({
      reactor: {
        backends: {
          main: { kind: "in-process", storage: { kind: "postgres" } },
        },
      },
    });
    const noPg = planMatrix(def, SWITCHBOARD, NO_PG).cells;
    expect(noPg[2].issues).toMatchObject([{ stage: "capability" }]);
  });

  it("drops a base's own postgres url", () => {
    const base = structuredClone(SWITCHBOARD);
    const host = base.host as { reactor: Record<string, unknown> };
    host.reactor.backends = {
      main: {
        kind: "in-process",
        storage: { kind: "postgres", url: "postgres://elsewhere/db" },
      },
    };
    const [, , postgres] = planMatrix(
      definition({ axes: [storageAxis()] }),
      base,
      CAPS,
    ).cells;
    expect(postgres.envelope?.host).toMatchObject({
      reactor: { backends: { main: { storage: { kind: "postgres" } } } },
    });
    expect(JSON.stringify(postgres.envelope)).not.toContain("elsewhere");
  });

  it("composes on a browser base", () => {
    const def = definition({
      attach: "in-process",
      axes: [storageAxis({ attach: "in-process" })],
    });
    const cells = planMatrix(def, CONNECT, NO_PG).cells;
    expect(
      cells.map((cell) => [cell.id, isRunnable(cell), cell.attach]),
    ).toEqual([
      ["storage=idb", true, "in-process"],
      ["storage=memory", true, "in-process"],
    ]);
  });

  it("marks values the capabilities or mode cannot offer", () => {
    const [path, memory, postgres] = storageAxis().values;
    expect(valueAvailability(postgres, NO_PG, "remote")).toMatchObject({
      available: false,
    });
    expect(valueAvailability(postgres, CAPS, "remote")).toEqual({
      available: true,
    });
    expect(valueAvailability(path, NO_PG, "remote")).toEqual({
      available: true,
    });
    expect(valueAvailability(path, NO_PG, "worker")).toMatchObject({
      available: false,
    });
    expect(valueAvailability(memory, NO_PG, "worker")).toEqual({
      available: true,
    });
  });
});
