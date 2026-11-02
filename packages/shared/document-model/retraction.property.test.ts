import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { baseCreateDocument, type PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import {
  appliedOperations,
  deriveScope,
  positionalOperations,
  redoTarget,
  retractedActionIds,
  undoTarget,
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
    (state) =>
      ({
        ...state,
        global: { items: [] },
        local: {},
      }) as ListState,
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

type Replica = { name: string; skew: number; rows: Operation[] };

const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const at = (operation: Operation) => Date.parse(operation.timestampUtcMs);

function nextIndex(rows: readonly Operation[]): number {
  let next = 0;
  for (const row of rows) next = Math.max(next, row.index + 1);
  return next;
}

/** The reactor's reshuffleByTimestamp. */
function reshuffle(
  start: { index: number; skip: number },
  rows: readonly Operation[],
): Operation[] {
  return [...rows]
    .sort(
      (a, b) =>
        at(a) - at(b) ||
        a.action.id.localeCompare(b.action.id) ||
        a.id.localeCompare(b.id),
    )
    .map((row, i) => ({
      ...row,
      index: start.index + i,
      skip: i === 0 ? start.skip : 0,
    }));
}

function place(
  replica: Replica,
  incoming: readonly Operation[],
  conflicting: boolean,
): void {
  const next = nextIndex(replica.rows);
  const earliest = Math.min(...incoming.map(at));
  const positional = positionalOperations(replica.rows);
  const firstMoving = positional.findIndex((row) => at(row) >= earliest);
  if (!conflicting || firstMoving === -1) {
    incoming.forEach((row, i) => {
      replica.rows.push({ ...row, index: next + i, skip: 0 });
    });
    return;
  }
  const moving = positional.slice(firstMoving);
  let firstRetracted = moving[0].index;
  for (const row of moving) {
    firstRetracted = Math.min(firstRetracted, row.index - row.skip);
  }
  replica.rows.push(
    ...reshuffle({ index: next, skip: next - firstRetracted }, [
      ...moving,
      ...incoming,
    ]),
  );
}

/** positionByTimestamp: backdated only when older than the stored head. */
function writeLocal(replica: Replica, action: Action): void {
  const head = Math.max(...replica.rows.map(at));
  place(
    replica,
    [operationOf(action)],
    Date.parse(action.timestampUtcMs) < head,
  );
}

/** A base-reducer 3 load: dedup by action id, receiver-derived index and skip. */
function load(receiver: Replica, batch: readonly Operation[]): boolean {
  const have = new Set(receiver.rows.map((row) => row.action.id));
  const fresh: Operation[] = [];
  for (const row of batch) {
    if (have.has(row.action.id)) continue;
    have.add(row.action.id);
    fresh.push({ ...row, skip: 0 });
  }
  if (fresh.length === 0) return false;
  const earliest = Math.min(...fresh.map(at));
  place(
    receiver,
    fresh,
    receiver.rows.some((row) => at(row) >= earliest),
  );
  return true;
}

function operationOf(action: Action): Operation {
  return {
    id: `op-${action.id}`,
    index: 0,
    skip: 0,
    timestampUtcMs: action.timestampUtcMs,
    hash: "",
    action,
  };
}

type Derived = {
  appliedIds: string[];
  applied: string[];
  state: unknown;
};

function derive(rows: readonly Operation[]): Derived {
  const { document, applied } = deriveScope(emptyDocument(), rows, reducerFor);
  return {
    appliedIds: appliedOperations(rows).map((row) => row.action.id),
    applied: [...applied].sort(),
    state: document.state.global,
  };
}

/** The rule stated directly: live iff no live retraction names it. */
function referenceRetracted(rows: readonly Operation[]): Set<string> {
  const present = new Set(rows.map((row) => row.action.id));
  const targetOf = new Map<string, string>();
  for (const row of rows) {
    const target =
      row.action.type === "RETRACT"
        ? (row.action.input as { target: string }).target
        : undefined;
    if (
      target !== undefined &&
      target !== row.action.id &&
      present.has(target)
    ) {
      targetOf.set(row.action.id, target);
    }
  }
  const onCycle = [...targetOf.keys()].filter((start) => {
    let id = targetOf.get(start);
    for (let n = 0; id !== undefined && n <= targetOf.size; n++) {
      if (id === start) return true;
      id = targetOf.get(id);
    }
    return false;
  });
  for (const id of onCycle) targetOf.delete(id);
  const live = new Map<string, boolean>();
  const isLive = (id: string): boolean => {
    const known = live.get(id);
    if (known !== undefined) return known;
    let result = true;
    for (const [retraction, target] of targetOf) {
      if (target === id && isLive(retraction)) result = false;
    }
    live.set(id, result);
    return result;
  };
  return new Set([...present].filter((id) => !isLive(id)));
}

function checkReplica(replica: Replica, random: () => number): void {
  const positional = positionalOperations(replica.rows);
  const positionalIds = positional.map((row) => row.action.id);
  expect(new Set(positionalIds).size, `${replica.name} positional ids`).toBe(
    positionalIds.length,
  );
  expect(
    [...new Set(replica.rows.map((row) => row.action.id))].sort(),
    `${replica.name} positional rows hold every stored action`,
  ).toEqual([...positionalIds].sort());

  const shuffled = [...positional];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  expect(
    [...retractedActionIds(shuffled)].sort(),
    `${replica.name} retracted set is independent of row order`,
  ).toEqual([...retractedActionIds(positional)].sort());
  expect(
    [...retractedActionIds(positional)].sort(),
    `${replica.name} retracted set vs the rule stated directly`,
  ).toEqual([...referenceRetracted(positional)].sort());
}

function runCase(seed: number, trace: string[]): void {
  const random = mulberry32(seed);
  const int = (n: number) => Math.floor(random() * n);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)];

  const replicas: Replica[] = Array.from({ length: 2 + int(2) }, (_, i) => ({
    name: String.fromCharCode(65 + i),
    skew: int(9) - 4,
    rows: [],
  }));
  const steps = 10 + int(31);
  const known: string[] = [];
  let writes = 0;
  let ghosts = 0;

  const newAction = (
    replica: Replica,
    step: number,
    type: string,
    input: unknown,
    id?: string,
  ): Action => {
    const jitter = random() < 0.2 ? -int(4) : 0;
    const seq = writes++;
    const action: Action = {
      id: id ?? `x${String(seq).padStart(4, "0")}`,
      type,
      input,
      scope: "global",
      timestampUtcMs: new Date(
        BASE_TIME + (step + replica.skew + jitter + 10) * 1000 + seq,
      ).toISOString(),
    };
    known.push(action.id);
    return action;
  };

  const write = (replica: Replica, action: Action, label: string) => {
    trace.push(
      `${replica.name} ${label} ${action.id}@${action.timestampUtcMs.slice(14, 23)}`,
    );
    writeLocal(replica, action);
  };

  const retractRow = (replica: Replica, step: number, target: string) =>
    newAction(replica, step, "RETRACT", { target });

  for (let step = 0; step < steps; step++) {
    const replica = pick(replicas);
    const roll = random();
    if (roll < 0.35) {
      const action =
        random() < 0.75
          ? newAction(replica, step, "PUSH", { v: `v${writes}` })
          : newAction(replica, step, "POP", {});
      write(replica, action, action.type);
    } else if (roll < 0.5) {
      const { applied } = deriveScope(
        emptyDocument(),
        replica.rows,
        reducerFor,
      );
      const isUndo = random() < 0.55;
      const target = isUndo
        ? undoTarget(replica.rows, applied)
        : redoTarget(replica.rows, applied);
      if (target === undefined) {
        trace.push(`${replica.name} ${isUndo ? "UNDO" : "REDO"} refused`);
        continue;
      }
      write(
        replica,
        retractRow(replica, step, target),
        `${isUndo ? "UNDO" : "REDO"}->RETRACT(${target})`,
      );
    } else if (roll < 0.6) {
      const present = replica.rows.map((row) => row.action.id);
      const retracted = [
        ...retractedActionIds(positionalOperations(replica.rows)),
      ];
      const kind = random();
      let target: string;
      if (kind < 0.35 && present.length > 0) target = pick(present);
      else if (kind < 0.55 && retracted.length > 0) target = pick(retracted);
      else if (kind < 0.85 && known.length > 0) target = pick(known);
      else target = `ghost${ghosts++}`;
      write(replica, retractRow(replica, step, target), `RETRACT(${target})`);
    } else if (roll < 0.63) {
      const p = `forged${ghosts++}`;
      const q = `forged${ghosts++}`;
      write(
        replica,
        newAction(replica, step, "RETRACT", { target: q }, p),
        `RETRACT(${q})`,
      );
      write(
        pick(replicas),
        newAction(replica, step, "RETRACT", { target: p }, q),
        `RETRACT(${p})`,
      );
    } else if (roll < 0.65) {
      const self = `self${ghosts++}`;
      write(
        replica,
        newAction(replica, step, "RETRACT", { target: self }, self),
        `RETRACT(${self})`,
      );
    } else {
      const sender = pick(replicas);
      const receiver = pick(replicas.filter((other) => other !== sender));
      const rows = positionalOperations(sender.rows);
      const batch = rows.filter(() => random() < 0.6);
      const repeat = random() < 0.3;
      trace.push(
        `${sender.name}->${receiver.name} [${batch.map((row) => row.action.id).join(",")}]${repeat ? " x2" : ""}`,
      );
      load(receiver, batch);
      if (repeat) load(receiver, batch);
    }
    for (const each of replicas) checkReplica(each, random);
  }

  trace.push("quiesce");
  for (let changed = true; changed;) {
    changed = false;
    for (const sender of replicas) {
      for (const receiver of replicas) {
        if (sender === receiver) continue;
        if (load(receiver, positionalOperations(sender.rows))) changed = true;
      }
    }
  }

  for (const each of replicas) checkReplica(each, random);
  const [first, ...rest] = replicas;
  const expected = derive(first.rows);
  for (const replica of rest) {
    expect(
      positionalOperations(replica.rows).map((row) => row.action.id),
      `${replica.name} positional order vs ${first.name}`,
    ).toEqual(positionalOperations(first.rows).map((row) => row.action.id));
    const actual = derive(replica.rows);
    expect(
      actual.appliedIds,
      `${replica.name} applied ids vs ${first.name}`,
    ).toEqual(expected.appliedIds);
    expect(
      actual.applied,
      `${replica.name} applied set vs ${first.name}`,
    ).toEqual(expected.applied);
    expect(actual.state, `${replica.name} state vs ${first.name}`).toEqual(
      expected.state,
    );
  }
}

describe("retraction rule, model-level differential property", () => {
  const BASE_SEED = 0x2d0c3;
  const CASES = 400;
  const only = process.env.PROPERTY_SEED;
  const seeds =
    only === undefined
      ? Array.from({ length: CASES }, (_, i) => BASE_SEED + i)
      : [Number(only)];

  it("replicas holding the same rows derive the same live set, order and state", () => {
    for (const seed of seeds) {
      const trace: string[] = [];
      try {
        runCase(seed, trace);
      } catch (error) {
        throw new Error(
          `seed ${seed} (rerun with PROPERTY_SEED=${seed}): ${(error as Error).message}\n${trace.join("\n")}`,
          { cause: error },
        );
      }
    }
  });
});
