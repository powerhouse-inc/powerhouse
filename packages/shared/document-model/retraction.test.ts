import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { AUTH_NO_GRANT_REASON } from "./denied.js";
import { baseCreateDocument, type PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import {
  appliedOperations,
  deriveScope,
  deriveScopeVersioned,
  positionalOperations,
  redoTarget,
  reduceOne,
  retractedActionIds,
  undoTarget,
  type ReducerFor,
  type ScopeVersions,
} from "./retraction.js";
import { createReducer, stateReducerOf } from "./reducer.js";
import { defaultBaseState, type PHBaseState } from "./state.js";
import type { StateReducer } from "./types.js";

type ListState = PHBaseState & {
  global: { count: number; items: string[] };
  local: { note: string };
};

const at = "2026-09-25T00:00:00.000Z";

function action(
  id: string,
  type: string,
  input: unknown = {},
  scope = "global",
): Action {
  return { id, type, input, scope, timestampUtcMs: at };
}

const inc = (id: string, by = 1) => action(id, "INC", { by });
const add = (id: string, item = id) => action(id, "ADD", { item });
const fail = (id: string) => action(id, "FAIL");
const noop = (id: string) => action(id, "NOOP");
const R = (target: string, id = `R(${target})`) =>
  action(id, "RETRACT", { target });

function op(act: Action, index: number, skip = 0): Operation {
  return {
    id: `op-${index}`,
    index,
    skip,
    hash: "",
    timestampUtcMs: at,
    action: act,
  };
}

function stream(...actions: Action[]): Operation[] {
  return actions.map((act, index) => op(act, index));
}

function denied(operation: Operation): Operation {
  return { ...operation, deniedReason: AUTH_NO_GRANT_REASON };
}

const ids = (operations: readonly Operation[]) =>
  operations.map((operation) => operation.action.id);

const listReducer: StateReducer<ListState> = (state, act) => {
  const input = act.input as { by?: number; item?: string };
  switch (act.type) {
    case "INC":
      state.global.count += input.by ?? 1;
      break;
    case "ADD":
      if (state.global.items.includes(input.item!)) {
        throw new Error(`duplicate ${input.item}`);
      }
      state.global.items.push(input.item!);
      break;
    case "NOTE":
      state.local.note = (act.input as { note: string }).note;
      break;
    case "FAIL":
      throw new Error("fails");
    case "REPLACE":
      return {
        ...state,
        global: { count: -1, items: ["replaced"] },
      } as ListState;
  }
};

function countingReducerFor(): {
  reducerFor: ReducerFor<ListState>;
  calls: () => number;
} {
  let calls = 0;
  const counted: StateReducer<ListState> = (state, act) => {
    calls++;
    return listReducer(state, act);
  };
  return {
    reducerFor: () => counted,
    calls: () => calls,
  };
}

const reducerFor: ReducerFor<ListState> = () => listReducer;

function createDoc(
  current?: Partial<Pick<ListState, "global" | "local">>,
): PHDocument<ListState> {
  const document = baseCreateDocument<ListState>(() => ({
    ...defaultBaseState(),
    global: { count: 0, items: [] },
    local: { note: "" },
  }));
  return current === undefined
    ? document
    : { ...document, state: { ...document.state, ...current } };
}

function derive(operations: readonly Operation[]) {
  return deriveScope(createDoc(), operations, reducerFor);
}

function seededShuffle<T>(values: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const sorted = (set: ReadonlySet<string>) => [...set].sort();

describe("retractedActionIds", () => {
  it("retracts the target of a single retraction", () => {
    expect(sorted(retractedActionIds(stream(add("a"), R("a"))))).toEqual(["a"]);
  });

  it("alternates liveness along a chain", () => {
    const rows = stream(add("a"), R("a"), R("R(a)"), R("R(R(a))"));
    expect(sorted(retractedActionIds(rows))).toEqual(["R(R(a))", "a"].sort());
    expect(sorted(retractedActionIds(rows.slice(0, 3)))).toEqual(["R(a)"]);
  });

  it("settles a 10k-deep chain without recursion", () => {
    const depth = 10_000;
    const actions = [add("x0")];
    for (let i = 1; i <= depth; i++) {
      actions.push(R(`x${i - 1}`, `x${i}`));
    }
    const retracted = retractedActionIds(stream(...actions));
    // x10000 is live, so the odd distances from the top are retracted.
    expect(retracted.size).toBe(depth / 2);
    expect(retracted.has(`x${depth - 1}`)).toBe(true);
    expect(retracted.has("x0")).toBe(false);
  });

  it("revives an undo through redo of redo", () => {
    const rows = stream(add("a"), add("b"), R("b"), R("R(b)"), R("R(R(b))"));
    expect(sorted(retractedActionIds(rows))).toEqual(["R(R(b))", "b"].sort());
    expect(sorted(retractedActionIds(rows.slice(0, 4)))).toEqual(["R(b)"]);
  });

  it("makes a 2-cycle inert", () => {
    const rows = stream(add("a"), R("q", "p"), R("p", "q"));
    expect(sorted(retractedActionIds(rows))).toEqual([]);
  });

  it("makes a 3-cycle inert", () => {
    const rows = stream(R("q", "p"), R("r", "q"), R("p", "r"));
    expect(sorted(retractedActionIds(rows))).toEqual([]);
  });

  it("lets a tail retract its target on a cycle and nothing else", () => {
    const rows = stream(R("q", "p"), R("p", "q"), R("p", "t"), R("t", "u"));
    // u is live, so t is retracted; p would be retracted only by t.
    expect(sorted(retractedActionIds(rows))).toEqual(["t"]);
    expect(sorted(retractedActionIds(rows.slice(0, 3)))).toEqual(["p"]);
  });

  it("makes a self-target inert", () => {
    const rows = stream(add("a"), R("s", "s"));
    expect(sorted(retractedActionIds(rows))).toEqual([]);
  });

  it("ignores an absent target until it arrives", () => {
    const rows = stream(R("a"));
    expect(sorted(retractedActionIds(rows))).toEqual([]);
    expect(sorted(retractedActionIds([...rows, op(add("a"), 1)]))).toEqual([
      "a",
    ]);
  });

  it("keeps a target retracted while one of two retractions is live", () => {
    const both = stream(add("a"), R("a", "r1"), R("a", "r2"));
    expect(sorted(retractedActionIds(both))).toEqual(["a"]);

    const oneRetracted = [...both, op(R("r1", "r3"), 3)];
    expect(sorted(retractedActionIds(oneRetracted))).toEqual(["a", "r1"]);

    const bothRetracted = [...oneRetracted, op(R("r2", "r4"), 4)];
    expect(sorted(retractedActionIds(bothRetracted))).toEqual(["r1", "r2"]);
  });

  it("ignores rows that are not retractions", () => {
    expect(sorted(retractedActionIds(stream(add("a"), noop("n"))))).toEqual([]);
  });

  it("gives the same result for every order of the same rows", () => {
    const rows = stream(
      add("a"),
      add("b"),
      R("b"),
      R("R(b)"),
      R("R(R(b))"),
      R("a", "r1"),
      R("a", "r2"),
      R("r1", "r3"),
      R("q", "p"),
      R("p", "q"),
      R("p", "t"),
      R("t", "u"),
      R("c1", "c3"),
      R("c3", "c2"),
      R("c2", "c1"),
      R("s", "s"),
      R("missing"),
      R("R(missing)"),
    );
    const expected = sorted(retractedActionIds(rows));
    expect(expected).toEqual(
      ["R(R(b))", "a", "b", "r1", "t", "R(missing)"].sort(),
    );
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const shuffled = seededShuffle(rows, seed);
      expect(sorted(retractedActionIds(shuffled)), `seed ${seed}`).toEqual(
        expected,
      );
    }
  });
});

describe("appliedOperations", () => {
  it("excludes retracted rows, retractions and denied rows", () => {
    const rows = stream(add("a"), add("b"), R("b"), noop("n"), add("d"));
    rows[4] = denied(rows[4]);
    expect(ids(appliedOperations(rows))).toEqual(["a", "n"]);
  });

  it("keeps a row whose retraction is retracted", () => {
    const rows = stream(add("a"), R("a"), R("R(a)"));
    expect(ids(appliedOperations(rows))).toEqual(["a"]);
  });

  it("drops rows a later rewind covers", () => {
    const rows = [
      op(add("a"), 0),
      op(add("b"), 1),
      op(add("c"), 2),
      op(add("d"), 3, 2),
    ];
    expect(ids(positionalOperations(rows))).toEqual(["a", "d"]);
    expect(ids(appliedOperations(rows))).toEqual(["a", "d"]);
  });

  it("drops a retraction a rewind covers, so its target applies", () => {
    const rows = [op(add("a"), 0), op(R("a"), 1), op(add("b"), 2, 1)];
    expect(ids(appliedOperations(rows))).toEqual(["a", "b"]);
  });

  it("applies rows in index order whatever the input order", () => {
    const rows = stream(add("a"), add("b"), R("a"), add("c"));
    expect(ids(appliedOperations(seededShuffle(rows, 5)))).toEqual(["b", "c"]);
  });
});

describe("reduceOne", () => {
  it("applies a model action through reducerFor", () => {
    const { reducerFor: counted, calls } = countingReducerFor();
    const next = reduceOne(createDoc(), op(add("a"), 0), counted);
    expect(next.state.global.items).toEqual(["a"]);
    expect(calls()).toBe(1);
  });

  it("takes a reducer's returned state", () => {
    const next = reduceOne(
      createDoc(),
      op(action("x", "REPLACE"), 0),
      reducerFor,
    );
    expect(next.state.global).toEqual({ count: -1, items: ["replaced"] });
  });

  it("applies SET_NAME through the base action reducer", () => {
    const { reducerFor: counted, calls } = countingReducerFor();
    const next = reduceOne(
      createDoc(),
      op(action("n", "SET_NAME", { name: "renamed" }), 0),
      counted,
    );
    expect(next.header.name).toBe("renamed");
    expect(calls()).toBe(0);
  });

  it.each(["NOOP", "RETRACT"])("applies nothing for %s", (type) => {
    const { reducerFor: counted, calls } = countingReducerFor();
    const document = createDoc();
    const next = reduceOne(
      document,
      op(action("x", type, { target: "a" }), 0),
      counted,
    );
    expect(next).toBe(document);
    expect(calls()).toBe(0);
  });

  it.each(["auth", "document"])("throws on the %s scope", (scope) => {
    expect(() =>
      reduceOne(createDoc(), op(action("x", "INC", {}, scope), 0), reducerFor),
    ).toThrow(scope);
  });

  it("throws when the action throws", () => {
    expect(() => reduceOne(createDoc(), op(fail("f"), 0), reducerFor)).toThrow(
      "fails",
    );
  });

  it("never mutates the input document", () => {
    const document = deepFreeze(createDoc());
    const snapshot = structuredClone(document);
    const cases = [
      op(add("a"), 0),
      op(inc("i"), 0),
      op(action("x", "REPLACE"), 0),
      op(action("n", "SET_NAME", { name: "renamed" }), 0),
    ];
    for (const operation of cases) {
      const next = reduceOne(document, operation, reducerFor);
      expect(next).not.toBe(document);
    }
    expect(document).toEqual(snapshot);
  });
});

describe("deriveScope", () => {
  it("starts the scope from initialState and leaves other scopes alone", () => {
    const document = createDoc({
      global: { count: 5, items: ["stale"] },
      local: { note: "kept" },
    });
    const { document: next, applied } = deriveScope(
      document,
      stream(add("a"), inc("i", 2)),
      reducerFor,
    );
    expect(next.state.global).toEqual({ count: 2, items: ["a"] });
    expect(next.state.local).toEqual({ note: "kept" });
    expect(sorted(applied)).toEqual(["a", "i"]);
  });

  it("derives a non-global scope from its own initial state", () => {
    const document = createDoc({
      global: { count: 5, items: ["kept"] },
      local: { note: "stale" },
    });
    const notes = [
      op(action("n1", "NOTE", { note: "one" }, "local"), 0),
      op(action("n2", "NOTE", { note: "two" }, "local"), 1),
      op(R("n2", "Rn2"), 2),
    ].map((operation) =>
      operation.action.type === "RETRACT"
        ? { ...operation, action: { ...operation.action, scope: "local" } }
        : operation,
    );
    const { document: next } = deriveScope(document, notes, reducerFor);
    expect(next.state.local).toEqual({ note: "one" });
    expect(next.state.global).toEqual({ count: 5, items: ["kept"] });
  });

  it("applies nothing for a throwing row and still applies later rows", () => {
    const rows = stream(add("a"), fail("f"), add("dup", "a"), add("b"));
    const { document, applied } = derive(rows);
    expect(document.state.global.items).toEqual(["a", "b"]);
    expect(sorted(applied)).toEqual(["a", "b"]);
  });

  it("leaves no partial write from a row that throws midway", () => {
    const midway: StateReducer<ListState> = (state, act) => {
      state.global.count += 1;
      if (act.type === "FAIL") throw new Error("fails");
      return undefined;
    };
    const { document } = deriveScope(
      createDoc(),
      stream(inc("i"), fail("f"), inc("j")),
      () => midway,
    );
    expect(document.state.global.count).toBe(2);
  });

  it("re-derives a row that throws until its blocker is retracted", () => {
    const rows = stream(add("a"), add("dup", "a"), R("a"));
    const { document, applied } = derive(rows);
    expect(document.state.global.items).toEqual(["a"]);
    expect(sorted(applied)).toEqual(["dup"]);
  });

  it("returns the document unchanged for an empty stream", () => {
    const document = createDoc({
      global: { count: 3, items: ["kept"] },
      local: { note: "" },
    });
    const result = deriveScope(document, [], reducerFor);
    expect(result.document).toBe(document);
    expect(result.applied.size).toBe(0);
  });

  it("never mutates the input document", () => {
    const document = createDoc({
      global: { count: 3, items: ["kept"] },
      local: { note: "kept" },
    });
    const snapshot = structuredClone(document);
    const { document: next } = deriveScope(
      document,
      stream(add("a"), inc("i"), R("i"), fail("f")),
      reducerFor,
    );
    expect(document).toEqual(snapshot);
    expect(next.state.global).toEqual({ count: 0, items: ["a"] });
  });

  it("derives a 10k-row stream in one pass", () => {
    const rows: Operation[] = [];
    for (let i = 0; rows.length < 10_000; i++) {
      rows.push(op(inc(`i${i}`), rows.length));
      if (i % 10 === 9) rows.push(op(R(`i${i}`), rows.length));
    }
    const { reducerFor: counted, calls } = countingReducerFor();
    const started = performance.now();
    const { document, applied } = deriveScope(createDoc(), rows, counted);
    const elapsed = performance.now() - started;

    const retractions = rows.filter((row) => row.action.type === "RETRACT");
    expect(calls()).toBe(rows.length - 2 * retractions.length);
    expect(applied.size).toBe(calls());
    expect(document.state.global.count).toBe(calls());
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe("deriveScopeVersioned", () => {
  // Version 1 adds items as given, version 2 upper-cases them; the upgrade
  // marks the boundary in the state it migrates.
  const byVersion: Record<number, StateReducer<ListState>> = {
    1: listReducer,
    2: (state, act) =>
      act.type === "ADD"
        ? listReducer(state, {
            ...act,
            input: { item: (act.input as { item: string }).item.toUpperCase() },
          })
        : listReducer(state, act),
  };

  function versions(boundary: number): {
    versions: ScopeVersions;
    upgrades: () => number;
  } {
    let held = [2];
    let upgrades = 0;
    return {
      versions: {
        versionOf: (operation) => (operation.index < boundary ? 1 : 2),
        reducerOf: (version) => byVersion[version] as unknown as StateReducer,
        upgradeTo: (document, version) => {
          if (held.length === 0 || version < held[0]) return document;
          held = [];
          upgrades++;
          const state = document.state as unknown as ListState;
          return {
            ...document,
            state: {
              ...document.state,
              global: {
                ...state.global,
                items: [...state.global.items, "upgraded"],
              },
            },
          };
        },
      },
      upgrades: () => upgrades,
    };
  }

  it("applies each row with its version's reducer and upgrades at the boundary", () => {
    const rows = stream(add("a"), add("b"), add("c"), R("a"));
    const { document, applied } = deriveScopeVersioned(
      createDoc({
        global: { count: 0, items: ["stale"] },
        local: { note: "" },
      }),
      rows,
      versions(2).versions,
    );
    expect(document.state.global.items).toEqual(["b", "upgraded", "C"]);
    expect(sorted(applied)).toEqual(["b", "c"]);
  });

  it("upgrades where a row it does not apply crosses the boundary", () => {
    const rows = stream(add("a"), add("b"), R("b"));
    const { versions: hooks, upgrades } = versions(1);
    const { document } = deriveScopeVersioned(createDoc(), rows, hooks);
    expect(upgrades()).toBe(1);
    expect(document.state.global.items).toEqual(["a", "upgraded"]);
  });

  it("agrees with deriveScope when every row has one version", () => {
    const rows = stream(add("a"), inc("i"), fail("f"), R("i"), add("b"));
    const single: ScopeVersions = {
      versionOf: () => 1,
      reducerOf: () => listReducer as unknown as StateReducer,
      upgradeTo: (document) => document,
    };
    const versioned = deriveScopeVersioned(createDoc(), rows, single);
    const plain = derive(rows);
    expect(versioned.document.state).toEqual(plain.document.state);
    expect(sorted(versioned.applied)).toEqual(sorted(plain.applied));
  });

  it("reports a row that throws", () => {
    const rows = stream(add("a"), fail("f"), add("b"));
    const thrown: string[] = [];
    deriveScopeVersioned(
      createDoc(),
      rows,
      versions(1).versions,
      "global",
      (operation, error) =>
        thrown.push(`${operation.action.id}: ${(error as Error).message}`),
    );
    expect(thrown).toEqual(["f: fails"]);
  });
});

describe("undoTarget and redoTarget", () => {
  const a = add("a");
  const b = add("b");
  const c = add("c");

  function resolve(operations: Operation[]) {
    const { document, applied } = derive(operations);
    return {
      items: document.state.global.items,
      undo: undoTarget(operations, applied),
      redo: redoTarget(operations, applied),
    };
  }

  it("a b: UNDO retracts b, leaving a", () => {
    const rows = stream(a, b);
    expect(resolve(rows).undo).toBe("b");
    expect(resolve([...rows, op(R("b"), 2)]).items).toEqual(["a"]);
  });

  it("a b R(b): UNDO retracts a, leaving nothing", () => {
    const rows = stream(a, b, R("b"));
    expect(resolve(rows).undo).toBe("a");
    expect(resolve([...rows, op(R("a"), 3)]).items).toEqual([]);
  });

  it("a b R(b) R(a): REDO retracts R(a), leaving a", () => {
    const rows = stream(a, b, R("b"), R("a"));
    expect(resolve(rows).redo).toBe("R(a)");
    expect(resolve([...rows, op(R("R(a)"), 4)]).items).toEqual(["a"]);
  });

  it("a b R(b) R(a) R': REDO retracts R(b), leaving a b", () => {
    const rows = stream(a, b, R("b"), R("a"), R("R(a)", "R'"));
    expect(resolve(rows).redo).toBe("R(b)");
    expect(resolve([...rows, op(R("R(b)"), 5)]).items).toEqual(["a", "b"]);
  });

  it("a b R(b) c: REDO is refused because c follows the undo", () => {
    const resolved = resolve(stream(a, b, R("b"), c));
    expect(resolved.redo).toBeUndefined();
    expect(resolved.items).toEqual(["a", "c"]);
  });

  it("a b R(b) R(a) R' R'': nothing is left to redo", () => {
    const rows = stream(
      a,
      b,
      R("b"),
      R("a"),
      R("R(a)", "R'"),
      R("R(b)", "R''"),
    );
    const resolved = resolve(rows);
    expect(resolved.items).toEqual(["a", "b"]);
    expect(resolved.redo).toBeUndefined();
    expect(resolved.undo).toBe("b");
  });

  it("UNDO skips a row whose action throws", () => {
    const resolved = resolve(stream(a, fail("f")));
    expect(resolved.undo).toBe("a");
  });

  it("UNDO and REDO skip NOOP and denied rows", () => {
    const rows = stream(a, b, noop("n"), add("d"));
    rows[3] = denied(rows[3]);
    const { applied } = derive(rows);
    expect(applied.has("n")).toBe(true);
    expect(undoTarget(rows, applied)).toBe("b");

    const afterUndo = [...stream(a, b, R("b"), noop("n2"), add("d2"))];
    afterUndo[4] = denied(afterUndo[4]);
    expect(resolve(afterUndo).redo).toBe("R(b)");
  });

  it("a throwing row after an undo does not refuse REDO", () => {
    expect(resolve(stream(a, b, R("b"), fail("f"))).redo).toBe("R(b)");
  });

  it("REDO retracts a retraction whose target throws when re-applied", () => {
    const rows = stream(a, fail("f"), R("f"));
    const resolved = resolve(rows);
    expect(resolved.redo).toBe("R(f)");

    const redone = [...rows, op(R("R(f)"), 3)];
    const { document, applied } = derive(redone);
    expect(applied.has("f")).toBe(false);
    expect(document.state.global.items).toEqual(["a"]);
    expect(undoTarget(redone, applied)).toBe("a");
  });

  it("REDO skips a retraction whose target is absent or not content", () => {
    expect(resolve(stream(a, R("missing"))).redo).toBeUndefined();
    expect(resolve(stream(a, b, R("b"), R("missing"))).redo).toBe("R(b)");
    expect(resolve(stream(a, noop("n"), R("n"))).redo).toBeUndefined();
  });

  it("ignores a rewound row when resolving", () => {
    const rows = [op(a, 0), op(b, 1), op(R("b"), 2), op(c, 3, 2)];
    const resolved = resolve(rows);
    expect(resolved.items).toEqual(["a", "c"]);
    expect(resolved.undo).toBe("c");
    expect(resolved.redo).toBeUndefined();
  });

  it("returns undefined when there is nothing to undo or redo", () => {
    expect(resolve([])).toMatchObject({ undo: undefined, redo: undefined });
    expect(resolve(stream(noop("n")))).toMatchObject({
      undo: undefined,
      redo: undefined,
    });
    expect(resolve(stream(a))).toMatchObject({ undo: "a", redo: undefined });
    expect(resolve(stream(a, R("a"), R("R(a)")))).toMatchObject({
      undo: "a",
      redo: undefined,
    });
    expect(resolve(stream(a, R("a")))).toMatchObject({
      undo: undefined,
      redo: "R(a)",
    });
  });
});

describe("review fixes", () => {
  it("a denied RETRACT retracts nothing and is no redo candidate", () => {
    const rows = [op(add("a"), 0), denied(op(R("a"), 1))];
    expect([...retractedActionIds(rows)]).toEqual([]);
    expect(ids(appliedOperations(rows))).toEqual(["a"]);
    const { applied } = derive(rows);
    expect(redoTarget(rows, applied)).toBeUndefined();
  });

  it("RETRACTs sharing an action id retract nothing", () => {
    const rows = stream(add("a"), add("b"), R("a", "x"), R("b", "x"));
    expect([...retractedActionIds(rows)]).toEqual([]);
  });

  it("a RETRACT with malformed input names no target", () => {
    const rows = stream(add("a"), action("x", "RETRACT", null));
    expect([...retractedActionIds(rows)]).toEqual([]);
  });

  it("UNDO and REDO rows are not content", () => {
    const rows = stream(add("a"), action("u", "UNDO", { count: 1 }));
    const { applied } = derive(rows);
    expect(undoTarget(rows, applied)).toBe("a");
  });

  it("throws on an auth or document stream instead of resetting it", () => {
    const document = createDoc();
    expect(() =>
      deriveScope(document, stream(action("g", "X", {}, "auth")), reducerFor),
    ).toThrow(/does not derive the auth scope/);
  });

  it("propagates a reducerFor failure", () => {
    const document = createDoc();
    const missing: ReducerFor = () => {
      throw new Error("no reducer for module version");
    };
    expect(() => deriveScope(document, stream(add("a")), missing)).toThrow(
      /no reducer for module version/,
    );
  });

  it("resets the named scope for an empty stream", () => {
    const document = derive(stream(add("stale"))).document;
    const { document: reset } = deriveScope(document, [], reducerFor, "global");
    expect((reset.state as ListState).global.items).toEqual([]);
  });

  it("stateReducerOf returns the state reducer createReducer wraps", () => {
    expect(stateReducerOf(createReducer(listReducer))).toBe(listReducer);
  });

  it("a RETRACT naming a base action is inert and base actions are not content", () => {
    const rows = stream(
      add("a"),
      action("sn", "SET_NAME", { name: "renamed" }),
      R("sn"),
    );
    expect([...retractedActionIds(rows)]).toEqual([]);
    const { applied } = derive(rows);
    expect(undoTarget(rows, applied)).toBe("a");
  });
});
