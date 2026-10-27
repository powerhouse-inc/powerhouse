import type {
  Operation,
  PHDocument,
  ProtocolVersions,
  ReducerFor,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import type { WalkPosition, WalkStream } from "../../src/decision/walk.js";
import { walkByPosition, walkIdOrder } from "../../src/decision/walk.js";
import { BASE_REDUCER_3_VERSIONS } from "../factories.js";

type Applied = { global: { applied: string[] } };

function doc(versions: ProtocolVersions): PHDocument {
  return {
    header: { id: "d", documentType: "t", protocolVersions: versions },
    state: { global: { applied: [] } },
    initialState: { global: { applied: [] } },
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

function applied(document: PHDocument | undefined): string[] {
  return (document!.state as unknown as Applied).global.applied;
}

function op(
  actionId: string,
  index: number,
  extra: { type?: string; input?: unknown } & Partial<Operation> = {},
): Operation {
  const { type = "SET", input = {}, ...rest } = extra;
  const timestampUtcMs = new Date(
    Date.UTC(2026, 0, 1, 0, 0, index),
  ).toISOString();
  return {
    id: `op-${actionId}`,
    index,
    skip: 0,
    timestampUtcMs,
    hash: `h-${actionId}`,
    action: { id: actionId, type, scope: "global", timestampUtcMs, input },
    ...rest,
  } as Operation;
}

const retract = (
  actionId: string,
  index: number,
  target: string,
  extra: Partial<Operation> = {},
) => op(actionId, index, { type: "RETRACT", input: { target }, ...extra });

/** Records each action it applies; "THROW" throws. Counts its calls. */
function recorder(): { reducerFor: ReducerFor; calls: () => number } {
  let calls = 0;
  const reducer: StateReducer = (state, action) => {
    calls++;
    if (action.type === "THROW") {
      throw new Error("refused");
    }
    (state as unknown as Applied).global.applied.push(action.id);
    return undefined;
  };
  return { reducerFor: () => reducer, calls: () => calls };
}

/** The per-row apply base-reducer 1 and 2 walk with: RETRACT is inert. */
const legacyApply = (document: PHDocument, operation: Operation): PHDocument =>
  operation.action.type === "RETRACT"
    ? document
    : ({
        ...document,
        state: {
          global: { applied: [...applied(document), operation.action.id] },
        },
      } as unknown as PHDocument);

function stream(
  operations: Operation[],
  options: {
    versions?: ProtocolVersions;
    scope?: string;
    reducerFor?: ReducerFor;
  } = {},
): WalkStream {
  return {
    streamKey: "s",
    scope: options.scope ?? "global",
    document: doc(options.versions ?? BASE_REDUCER_3_VERSIONS),
    operations,
    apply: legacyApply,
    reducerFor: options.reducerFor ?? recorder().reducerFor,
  };
}

/** The state before each operation, by action id, refusing what `deny` names. */
function statesBefore(
  walked: WalkStream,
  deny: (operation: Operation) => boolean = () => false,
): Map<string, string[]> {
  const positions: WalkPosition[] = [];
  const walk = walkByPosition(
    [walked],
    walkIdOrder([walked], walked.document.header.id),
  );
  let step = walk.next(false);
  while (!step.done) {
    positions.push(step.value);
    step = walk.next(deny(step.value.operation));
  }
  return new Map(
    positions.map((position) => [
      position.operation.action.id,
      applied(position.states.get("s")),
    ]),
  );
}

describe("walkByPosition on base-reducer 3", () => {
  it("re-derives at a RETRACT, so the next decision reads the retracted state", () => {
    const states = statesBefore(
      stream([op("a", 0), op("b", 1), retract("r", 2, "b"), op("c", 3)]),
    );

    expect(states.get("r")).toEqual(["a", "b"]);
    expect(states.get("c")).toEqual(["a"]);
  });

  it("leaves out a row whose retraction precedes it", () => {
    const states = statesBefore(
      stream([op("a", 0), retract("r", 1, "b"), op("b", 2), op("c", 3)]),
    );

    expect(states.get("c")).toEqual(["a"]);
  });

  it("revives a row when its retraction is retracted", () => {
    const states = statesBefore(
      stream([
        op("a", 0),
        retract("r1", 1, "a"),
        retract("r2", 2, "r1"),
        op("c", 3),
      ]),
    );

    expect(states.get("r2")).toEqual([]);
    expect(states.get("c")).toEqual(["a"]);
  });

  it("gives a stored-denied RETRACT no effect", () => {
    const states = statesBefore(
      stream([
        op("a", 0),
        op("b", 1),
        retract("r", 2, "b", { deniedReason: "denied by grant" }),
        op("c", 3),
      ]),
    );

    expect(states.get("c")).toEqual(["a", "b"]);
  });

  it("keeps a RETRACT this pass refused inert through later derives", () => {
    const states = statesBefore(
      stream([
        op("a", 0),
        op("b", 1),
        retract("r", 2, "b"),
        retract("r2", 3, "a"),
        op("c", 4),
      ]),
      (operation) => operation.action.id === "r",
    );

    expect(states.get("r2")).toEqual(["a", "b"]);
    expect(states.get("c")).toEqual(["b"]);
  });

  it("applies a row whatever error it was stored with", () => {
    const states = statesBefore(
      stream([op("a", 0, { error: "stored elsewhere" }), op("b", 1)]),
    );

    expect(states.get("b")).toEqual(["a"]);
  });

  it("applies nothing for a row that throws", () => {
    const states = statesBefore(
      stream([op("a", 0), op("x", 1, { type: "THROW" }), op("b", 2)]),
    );

    expect(states.get("b")).toEqual(["a"]);
  });

  it("derives once per RETRACT, keeping the walk linear", () => {
    const { reducerFor, calls } = recorder();
    const rows = Array.from({ length: 50 }, (_, i) => op(`o${i}`, i));
    rows.push(retract("r", 50, "o10"), op("tail", 51));

    const states = statesBefore(stream(rows, { reducerFor }));

    expect(states.get("tail")).toHaveLength(49);
    // One pass over the rows, plus one derive of 49 at the RETRACT.
    expect(calls()).toBeLessThanOrEqual(2 * rows.length);
  });

  it("leaves a RETRACT in the auth scope inert", () => {
    const { reducerFor, calls } = recorder();
    const states = statesBefore(
      stream([op("a", 0), retract("r", 1, "a"), op("c", 2)], {
        scope: "auth",
        reducerFor,
      }),
    );

    expect(states.get("c")).toEqual(["a"]);
    expect(calls()).toBe(0);
  });
});

describe("walkByPosition on base-reducer 2", () => {
  const v2 = { "base-reducer": 2 } as ProtocolVersions;

  it("applies row by row, with RETRACT inert", () => {
    const { reducerFor, calls } = recorder();
    const states = statesBefore(
      stream([op("a", 0), op("b", 1), retract("r", 2, "b"), op("c", 3)], {
        versions: v2,
        reducerFor,
      }),
    );

    expect(states.get("c")).toEqual(["a", "b"]);
    expect(calls()).toBe(0);
  });

  it("still skips a row stored with an error", () => {
    const states = statesBefore(
      stream([op("a", 0, { error: "stored" }), op("b", 1)], { versions: v2 }),
    );

    expect(states.get("b")).toEqual([]);
  });
});
