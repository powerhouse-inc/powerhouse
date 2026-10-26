import { describe, expect, it } from "vitest";
import { noop, retract, type Action } from "./actions.js";
import { baseCreateDocument, type PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import {
  advanceUndoTargets,
  appliedOperations,
  deriveScope,
  redoTarget,
  undoTarget,
  undoTargetsBase,
  type ReducerFor,
} from "./retraction.js";
import type { PHBaseState } from "./state.js";
import type { StateReducer } from "./types.js";

type ListState = PHBaseState & {
  global: { items: string[] };
  local: Record<string, never>;
};

const listReducer: StateReducer<ListState> = (state, action) => {
  switch (action.type) {
    case "PUSH":
      state.global.items.push((action.input as { v: string }).v);
      return undefined;
    case "POP":
      if (state.global.items.length === 0) {
        throw new Error("POP on an empty list");
      }
      state.global.items.pop();
      return undefined;
    default:
      return undefined;
  }
};

const reducerFor: ReducerFor<ListState> = () => listReducer;

const emptyDocument = (): PHDocument<ListState> =>
  baseCreateDocument<ListState>(
    (state) => ({ ...state, global: { items: [] }, local: {} }) as ListState,
    undefined,
    "",
    { "base-reducer": 3 },
  );

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applied(rows: readonly Operation[]): ReadonlySet<string> {
  return deriveScope(emptyDocument(), rows, reducerFor, "global").applied;
}

function fullTargets(rows: readonly Operation[]) {
  const set = applied(rows);
  return {
    undoTarget: undoTarget(rows, set),
    redoTarget: redoTarget(rows, set),
  };
}

/** A random stream as the writer stores it, `error` included. */
function stream(random: () => number, length: number): Operation[] {
  const rows: Operation[] = [];
  let n = 0;
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)];
  for (let index = 0; index < length; index++) {
    const roll = random();
    const id = `a${n++}`;
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString();
    let action: Action;
    let skip = 0;
    let deniedReason: string | undefined;
    if (roll < 0.4) {
      action = { id, type: "PUSH", input: { v: id }, scope: "global" } as never;
    } else if (roll < 0.55) {
      action = { id, type: "POP", input: {}, scope: "global" } as never;
    } else if (roll < 0.62) {
      action = { ...noop("global"), id };
    } else if (roll < 0.7) {
      action = { id, type: "PUSH", input: { v: id }, scope: "global" } as never;
      deniedReason = "denied";
    } else if (roll < 0.85 && rows.length > 0) {
      // Names a stored row, or an id not stored yet.
      const target =
        random() < 0.85
          ? pick(rows).action.id
          : `a${n + Math.floor(random() * 3)}`;
      action = { ...retract(target, "global"), id };
    } else if (roll < 0.92 && rows.length > 0) {
      // A reshuffle's rewind.
      action = { id, type: "PUSH", input: { v: id }, scope: "global" } as never;
      skip = 1 + Math.floor(random() * Math.min(3, index));
    } else {
      action = { id, type: "PUSH", input: { v: id }, scope: "global" } as never;
    }
    action = { ...action, timestampUtcMs: at };
    const row: Operation = {
      id: `op-${index}`,
      index,
      skip,
      timestampUtcMs: at,
      hash: "",
      action,
      ...(deniedReason === undefined ? {} : { deniedReason }),
    } as Operation;
    const withRow = [...rows, row];
    const live = appliedOperations(withRow).includes(row);
    if (live && !applied(withRow).has(row.action.id)) {
      row.error = "threw";
    }
    rows.push(row);
  }
  return rows;
}

describe("advanceUndoTargets", () => {
  it("equals a full derivation's targets over every append-only split", () => {
    let advanced = 0;
    let rederived = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const random = mulberry32(seed);
      const rows = stream(random, 4 + Math.floor(random() * 22));
      const expected = fullTargets(rows);
      for (let split = 0; split <= rows.length; split++) {
        const prefix = rows.slice(0, split);
        const base = undoTargetsBase(prefix, applied(prefix));
        const result = advanceUndoTargets(base, rows.slice(split));
        if (result === "rederive") {
          rederived++;
          continue;
        }
        advanced++;
        expect(result, `seed ${seed}, split ${split}`).toEqual(expected);
      }
    }
    // Both arms are exercised.
    expect(advanced).toBeGreaterThan(500);
    expect(rederived).toBeGreaterThan(500);
  });

  it("keeps the targets over no new rows", () => {
    const rows = stream(mulberry32(7), 12);
    const base = undoTargetsBase(rows, applied(rows));
    expect(advanceUndoTargets(base, [])).toEqual(fullTargets(rows));
  });

  const row = (
    index: number,
    action: Action,
    extra: Partial<Operation> = {},
  ): Operation =>
    ({
      id: `op-${index}`,
      index,
      skip: 0,
      timestampUtcMs: action.timestampUtcMs,
      hash: "",
      action,
      ...extra,
    }) as Operation;
  const push = (id: string): Action =>
    ({
      id,
      type: "PUSH",
      input: { v: id },
      scope: "global",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
    }) as Action;

  it("re-derives on a rewind, a RETRACT or a named row", () => {
    const a = row(0, push("a"));
    const base = undoTargetsBase([a], applied([a]));
    const inert = row(1, { ...retract("x", "global"), id: "r" });
    const withInert = undoTargetsBase([a, inert], applied([a, inert]));
    expect(advanceUndoTargets(base, [row(1, push("b"), { skip: 1 })])).toBe(
      "rederive",
    );
    expect(advanceUndoTargets(base, [inert])).toBe("rederive");
    expect(advanceUndoTargets(withInert, [row(2, push("x"))])).toBe("rederive");
  });

  it("moves undo to the last applied content row and clears redo", () => {
    const a = row(0, push("a"));
    const undone = row(1, { ...retract("a", "global"), id: "r" });
    const base = undoTargetsBase([a, undone], applied([a, undone]));
    expect(base.targets).toEqual({ undoTarget: undefined, redoTarget: "r" });

    expect(
      advanceUndoTargets(base, [
        row(2, push("b")),
        row(3, push("c"), { error: "threw" }),
        row(4, push("d"), { deniedReason: "denied" } as Partial<Operation>),
        row(5, { ...noop("global"), id: "n" }),
      ]),
    ).toEqual({ undoTarget: "b", redoTarget: undefined });
    expect(
      advanceUndoTargets(base, [row(2, push("c"), { error: "threw" })]),
    ).toEqual({ undoTarget: undefined, redoTarget: "r" });
  });
});
