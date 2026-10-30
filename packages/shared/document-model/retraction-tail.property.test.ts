import { describe, expect, it } from "vitest";
import { retract, type Action } from "./actions.js";
import { isDenied } from "./denied.js";
import { baseCreateDocument, type PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import {
  deriveScope,
  reduceOne,
  retractionTarget,
  tailAppliesIncrementally,
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

const POOL = 6;

function row(
  action: Action,
  index: number,
  skip = 0,
  deniedReason?: string,
): Operation {
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString();
  return {
    id: `op-${action.id}`,
    index,
    skip,
    timestampUtcMs: at,
    hash: "",
    action: { ...action, timestampUtcMs: at },
    ...(deniedReason === undefined ? {} : { deniedReason }),
  } as Operation;
}

const content = (id: string, type: "PUSH" | "POP" = "PUSH"): Action =>
  ({
    id,
    type,
    input: type === "PUSH" ? { v: id } : {},
    scope: "global",
  }) as never;

/** Ids from a small pool, so RETRACTs often name stored and future rows. */
function stream(random: () => number, length: number): Operation[] {
  const rows: Operation[] = [];
  const id = () => `a${Math.floor(random() * POOL)}`;
  for (let index = 0; index < length; index++) {
    const roll = random();
    if (roll < 0.4) {
      rows.push(row(content(id()), index));
    } else if (roll < 0.5) {
      rows.push(row(content(id(), "POP"), index));
    } else if (roll < 0.58) {
      rows.push(row(content(id()), index, 0, "denied"));
    } else if (roll < 0.85) {
      rows.push(row({ ...retract(id(), "global"), id: id() }, index));
    } else if (rows.length > 0) {
      rows.push(
        row(
          content(id()),
          index,
          1 + Math.floor(random() * Math.min(3, index)),
        ),
      );
    } else {
      rows.push(row(content(id()), index));
    }
  }
  return rows;
}

/** Rows after `base` whose action ids are new: admission refuses a repeat. */
function tail(
  random: () => number,
  base: readonly Operation[],
  length: number,
) {
  const used = new Set(base.map((operation) => operation.action.id));
  const rows: Operation[] = [];
  for (let i = 0; i < length; i++) {
    // From the pool, so a stored RETRACT may name it, else fresh.
    let id = `a${Math.floor(random() * (POOL + 2))}`;
    if (used.has(id)) id = `t${base.length + i}`;
    used.add(id);
    const roll = random();
    const index = base.length + i;
    rows.push(
      roll < 0.7
        ? row(content(id), index)
        : roll < 0.85
          ? row(content(id, "POP"), index)
          : row(content(id), index, 0, "denied"),
    );
  }
  return rows;
}

const items = (document: PHDocument<ListState>) => document.state.global.items;

function full(rows: readonly Operation[]): string[] {
  return items(
    deriveScope(emptyDocument(), rows, reducerFor, "global").document,
  );
}

/** The base derived once, then each tail row applied on its own. */
function incremental(
  base: readonly Operation[],
  appended: readonly Operation[],
): string[] {
  let document = deriveScope(
    emptyDocument(),
    base,
    reducerFor,
    "global",
  ).document;
  for (const operation of appended) {
    if (isDenied(operation)) continue;
    try {
      document = reduceOne(document, operation, reducerFor);
    } catch {
      // A row that throws applies nothing.
    }
  }
  return items(document);
}

const named = (rows: readonly Operation[]) =>
  new Set(
    rows
      .map((operation) => retractionTarget(operation))
      .filter((target): target is string => target !== undefined),
  );

describe("a tail of new action ids under the rule", () => {
  it("applies row by row whenever the predicate says so", () => {
    let incrementalTails = 0;
    let rederivedTails = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const random = mulberry32(seed);
      const base = stream(random, 2 + Math.floor(random() * 14));
      const appended = tail(random, base, 1 + Math.floor(random() * 3));
      const targets = named(base);
      const applies = tailAppliesIncrementally(appended, {
        named: (id) => targets.has(id),
      });
      if (!applies) {
        rederivedTails++;
        continue;
      }
      incrementalTails++;
      expect(full([...base, ...appended]), `seed ${seed}`).toEqual(
        incremental(base, appended),
      );
    }
    expect(incrementalTails).toBeGreaterThan(500);
    expect(rederivedTails).toBeGreaterThan(100);
  });
});
