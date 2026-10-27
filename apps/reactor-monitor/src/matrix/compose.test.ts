import { describe, expect, it } from "vitest";
import { CAPS, definition, hostExport, NO_PG } from "./__fixtures__/matrix.js";
import { composeCell, initialCell, isRunnable, planMatrix } from "./compose.js";
import { cellId } from "./expand.js";
import type { MatrixDefinitionInput, Setter } from "./schema.js";

const SWITCHBOARD = hostExport("switchboard");
const CONNECT = hostExport("connect");

const FLAGS = "host.reactor.protocol.featureFlags";

function oneCell(
  values: NonNullable<MatrixDefinitionInput["axes"]>[number]["values"],
  fields: Partial<MatrixDefinitionInput> = {},
) {
  return definition({ axes: [{ key: "a", values }], ...fields });
}

function compose(
  value: Record<string, unknown>,
  fields: Partial<MatrixDefinitionInput> = {},
  base = SWITCHBOARD,
  capabilities: { postgres: boolean; maxInstances: number } = CAPS,
) {
  const def = oneCell([{ key: "x", ...value }], fields);
  return composeCell(
    def,
    base,
    { id: "a=x", values: { a: "x" } },
    capabilities,
  );
}

const postgresStorage: Setter[] = [
  { path: "host.reactor.backends.main.kind", value: "in-process" },
  { path: "host.reactor.backends.main.storage.kind", value: "postgres" },
];

describe("composeCell", () => {
  it("applies setters and env to a copy of the base", () => {
    const cell = compose({
      setters: [{ path: `${FLAGS}.documentDecisions`, value: true }],
      env: { REACTOR_WORKERS: "0" },
      expect: { storageEngine: "pglite" },
    });
    expect(cell).toMatchObject({
      id: "a=x",
      attach: "remote",
      expect: "accept",
      env: { REACTOR_WORKERS: "0" },
      requires: [],
      storageEngine: "pglite",
      issues: [],
      combos: [],
    });
    expect(cell.skip).toBeUndefined();
    expect(cell.envelope?.host).toMatchObject({
      reactor: { protocol: { featureFlags: { documentDecisions: true } } },
    });
    expect(SWITCHBOARD.host).toMatchObject({
      reactor: { protocol: { featureFlags: { documentDecisions: false } } },
    });
  });

  it.each<[string, Record<string, unknown>, string, string]>([
    [
      "a code-loading path",
      { setters: [{ path: "host.runner.module", value: "x" }] },
      "host.runner.module",
      "runner.module loads code",
    ],
    [
      "a $delete-only path set",
      {
        setters: [{ path: "host.reactor.backends.main.readModel", value: {} }],
      },
      "host.reactor.backends.main.readModel",
      "may only be $delete'd",
    ],
    [
      "a denied $env leaf",
      {
        setters: [
          { path: "host.reactor.namespace", value: { $env: "NODE_OPTIONS" } },
        ],
      },
      "host.reactor.namespace",
      '"NODE_OPTIONS"',
    ],
    [
      "a denied env key",
      { env: { SKIP_CREDENTIAL_VERIFICATION: "true" } },
      "env.SKIP_CREDENTIAL_VERIFICATION",
      "not browser-settable",
    ],
  ])("refuses %s by policy", (_name, value, path, message) => {
    const cell = compose(value);
    expect(cell.envelope).toBeUndefined();
    expect(cell.issues).toEqual([
      {
        stage: "policy",
        path,
        message: expect.stringContaining(message) as string,
        axis: "a",
        value: "x",
      },
    ]);
  });

  it("refuses two axes that set one path differently", () => {
    const def = definition({
      axes: [
        {
          key: "a",
          values: [
            { key: "x", setters: [{ path: "host.runner.port", value: 1 }] },
          ],
        },
        {
          key: "b",
          values: [
            { key: "y", setters: [{ path: "host.runner.port", value: 2 }] },
          ],
        },
      ],
    });
    const cell = composeCell(
      def,
      SWITCHBOARD,
      { id: "a=x,b=y", values: { a: "x", b: "y" } },
      CAPS,
    );
    expect(cell.issues).toMatchObject([
      { stage: "conflict", path: "host.runner.port" },
    ]);
    expect(cell.envelope).toBeUndefined();
  });

  it("refuses a setter that cannot apply", () => {
    const cell = compose({
      setters: [{ path: "members.ghost.reactor.namespace", value: "n" }],
    });
    expect(cell.issues).toEqual([
      {
        stage: "setter",
        path: "members.ghost.reactor.namespace",
        message: "members.ghost does not exist",
        axis: "a",
        value: "x",
      },
    ]);
  });

  it.each<[string, Setter, string, string]>([
    [
      "a typo under protocol",
      { path: `${FLAGS}.authGroup`, value: true },
      "reactor.protocol.featureFlags",
      "Unrecognized key",
    ],
    [
      "port 0 on a standalone host",
      { path: "host.runner.port", value: 0 },
      "runner.port",
      "",
    ],
    [
      "a token where none is allowed",
      { path: "host.reactor.namespace", value: { $env: "REACTOR_NS" } },
      "reactor.namespace",
      "",
    ],
    [
      "a backend without a kind",
      { path: "host.reactor.backends.main.storage.kind", value: "path" },
      "reactor.backends.main.kind",
      "",
    ],
  ])("refuses %s by shape", (_name, setter, path, message) => {
    const cell = compose({ setters: [setter] });
    expect(cell.envelope).toBeDefined();
    expect(cell.issues.length).toBeGreaterThan(0);
    expect(cell.issues[0]).toMatchObject({
      stage: "shape",
      file: "hosts/switchboard/host.js",
      path,
      message: expect.stringContaining(message) as string,
    });
  });

  it("needs the postgres capability for postgres storage", () => {
    const missing = compose(
      { setters: postgresStorage },
      {},
      SWITCHBOARD,
      NO_PG,
    );
    expect(missing.issues).toEqual([
      {
        stage: "capability",
        path: "",
        message: expect.stringContaining("PH_MONITOR_PG_URL") as string,
      },
    ]);
    expect(missing.requires).toEqual(["postgres"]);
    const met = compose({ setters: postgresStorage });
    expect(met).toMatchObject({ issues: [], requires: ["postgres"] });
  });

  it("needs it for an explicit requirement too", () => {
    const cell = compose({ requires: ["postgres"] }, {}, SWITCHBOARD, NO_PG);
    expect(cell.issues).toMatchObject([{ stage: "capability" }]);
  });

  it("skips a built-in invalid combination by default", () => {
    const cell = compose({
      setters: [{ path: `${FLAGS}.authGroups`, value: true }],
    });
    expect(cell.skip).toBe(
      "built-in invalid combination: authGroups requires authEnforcement",
    );
    expect(cell.combos).toMatchObject([{ rule: "ladder" }]);
    expect(cell.expect).toBe("accept");
    expect(isRunnable(cell)).toBe(false);
  });

  it("runs it as a negative test that expects refusal", () => {
    const cell = compose(
      { setters: [{ path: `${FLAGS}.authGroups`, value: true }] },
      { negativeTests: true },
    );
    expect(cell.skip).toBeUndefined();
    expect(cell.expect).toBe("refusal");
    expect(cell.combos).toHaveLength(1);
    expect(isRunnable(cell)).toBe(true);
  });

  it("keeps an authoring error invalid even in negative tests", () => {
    const cell = compose(
      { setters: [{ path: "host.runner.module", value: "x" }] },
      { negativeTests: true },
    );
    expect(cell.expect).toBe("accept");
    expect(cell.issues).toMatchObject([{ stage: "policy" }]);
  });

  it("checks storage against the attach mode", () => {
    const setters: Setter[] = [
      { path: "host.reactor.backends.main.storage.kind", value: "path" },
    ];
    const browser = compose({ setters }, { attach: "worker" }, CONNECT);
    expect(browser.attach).toBe("worker");
    expect(browser.skip).toContain(
      'storage "path" is not offered for browser-provisioned cells',
    );
    const idb = compose(
      {
        setters: [
          { path: "host.reactor.backends.main.storage.kind", value: "idb" },
        ],
      },
      { attach: "worker" },
      CONNECT,
    );
    expect(idb.skip).toBeUndefined();
  });

  it("takes attach from a value over the definition", () => {
    expect(compose({ attach: "in-process" }).attach).toBe("in-process");
    expect(compose({}, { attach: "worker" }).attach).toBe("worker");
  });
});

describe("planMatrix", () => {
  const def = definition({
    repetitions: 2,
    axes: [
      {
        key: "auth",
        values: [
          { key: "l0" },
          {
            key: "bad",
            setters: [{ path: `${FLAGS}.authGroups`, value: true }],
          },
          { key: "mod", setters: [{ path: "host.runner.module", value: "x" }] },
        ],
      },
      {
        key: "mode",
        values: [{ key: "remote" }, { key: "tab", attach: "in-process" }],
      },
    ],
    rules: [{ kind: "exclude", when: { auth: "l0", mode: "tab" } }],
  });

  it("decides every cell and counts instances per attach mode", () => {
    const plan = planMatrix(def, SWITCHBOARD, CAPS);
    expect(
      plan.cells.map((cell) => [
        cell.id,
        cell.skip !== undefined,
        cell.issues.length,
      ]),
    ).toEqual([
      ["auth=l0,mode=remote", false, 0],
      ["auth=l0,mode=tab", true, 0],
      ["auth=bad,mode=remote", true, 0],
      ["auth=bad,mode=tab", true, 0],
      ["auth=mod,mode=remote", false, 1],
      ["auth=mod,mode=tab", false, 1],
    ]);
    expect(plan.cells[1]).toMatchObject({
      attach: "in-process",
      skip: "rule 1: excludes auth=l0 and mode=tab",
    });
    expect(plan.instances).toEqual({ remote: 2, browser: 0 });
    expect(plan.limit).toBeUndefined();
  });

  it("counts negative tests as instances", () => {
    const plan = planMatrix({ ...def, negativeTests: true }, SWITCHBOARD, CAPS);
    expect(plan.instances).toEqual({ remote: 4, browser: 2 });
  });

  it("refuses a plan over the instance limit", () => {
    const big = definition({
      repetitions: 5,
      axes: [
        {
          key: "n",
          values: Array.from({ length: 13 }, (_, i) => ({ key: `v${i}` })),
        },
      ],
    });
    expect(planMatrix(big, SWITCHBOARD, CAPS).limit).toBe(
      "65 instances (cells × repetitions); at most 64",
    );
    const fits = definition({ ...big, repetitions: 4 });
    expect(planMatrix(fits, SWITCHBOARD, CAPS).limit).toBeUndefined();
  });

  it("leaves the base untouched", () => {
    const before = structuredClone(SWITCHBOARD);
    planMatrix(def, SWITCHBOARD, CAPS);
    expect(SWITCHBOARD).toEqual(before);
  });
});

describe("initialCell", () => {
  it("starts a runnable cell with queued reps", () => {
    const def = definition({
      repetitions: 3,
      credentialVerification: "enforced",
    });
    const [composed] = planMatrix(def, SWITCHBOARD, CAPS).cells;
    const cell = initialCell(composed, def);
    expect(cell).toMatchObject({
      id: cellId({ a: "x" }),
      attach: "remote",
      credentialVerification: "enforced",
      expect: "accept",
      status: "pending",
      flaky: false,
    });
    expect(cell.reps.map((rep) => [rep.rep, rep.status])).toEqual([
      [1, "queued"],
      [2, "queued"],
      [3, "queued"],
    ]);
    expect(cell.outcome).toBeUndefined();
  });

  it.each<[string, Record<string, unknown>, string, string]>([
    [
      "a skipped cell",
      { setters: [{ path: `${FLAGS}.authGroups`, value: true }] },
      "skipped-constraint",
      "authGroups requires authEnforcement",
    ],
    [
      "a refused cell",
      { setters: [{ path: "host.runner.module", value: "x" }] },
      "invalid-static",
      "runner.module loads code",
    ],
    [
      "an unmet capability",
      { requires: ["postgres"] },
      "invalid-static",
      "needs a Postgres server",
    ],
  ])("finishes %s at once", (_name, value, outcome, reason) => {
    const def = oneCell([{ key: "x", ...value }]);
    const [composed] = planMatrix(def, SWITCHBOARD, NO_PG).cells;
    const cell = initialCell(composed, def);
    expect(cell).toMatchObject({
      status: "done",
      outcome,
      credentialVerification: "skipped",
      reps: [],
    });
    expect(cell.reason).toContain(reason);
  });
});
