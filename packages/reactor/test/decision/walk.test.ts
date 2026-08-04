import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  comparePositions,
  mergeByPosition,
} from "../../src/decision/merged-order.js";
import { staticReadSet } from "../../src/decision/build-decision-model.js";
import { documentDecisionModel } from "../../src/decision/document-decision-model.js";
import type { WalkPosition, WalkStream } from "../../src/decision/walk.js";
import { walkByPosition } from "../../src/decision/walk.js";

/**
 * A document whose state is the list of operation ids applied to it, so a walk's
 * effect is readable directly.
 */
function doc(applied: string[] = []): PHDocument {
  return {
    header: { id: "d", documentType: "t" },
    state: { applied },
    operations: {},
    clipboard: [],
    initialState: { applied: [] },
  } as unknown as PHDocument;
}

function applied(document: PHDocument): string[] {
  return (document.state as unknown as { applied: string[] }).applied;
}

const append = (document: PHDocument, operation: Operation): PHDocument =>
  doc([...applied(document), operation.action.id!]);

function op(
  actionId: string,
  seconds: number,
  extra: Partial<Operation> = {},
): Operation {
  return {
    id: `op-${actionId}`,
    index: extra.index ?? 0,
    skip: extra.skip ?? 0,
    timestampUtcMs: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
    hash: `h-${actionId}`,
    action: {
      id: actionId,
      type: "SET",
      scope: "global",
      timestampUtcMs: new Date(
        Date.UTC(2026, 0, 1, 0, 0, seconds),
      ).toISOString(),
      input: {},
    },
    ...extra,
  } as Operation;
}

function indexed(operations: Operation[]): Operation[] {
  return operations.map((operation, index) => ({ ...operation, index }));
}

/** Walks to completion refusing nothing, which is what most cases here want. */
function walkAll(streams: WalkStream[]): WalkPosition[] {
  return walkDeciding(streams, () => false);
}

/**
 * Walks to completion, feeding each position's verdict back to the generator.
 * `deny` receives the operation the walk just handed out.
 */
function walkDeciding(
  streams: WalkStream[],
  deny: (operation: Operation) => boolean,
): WalkPosition[] {
  const positions: WalkPosition[] = [];
  const walk = walkByPosition(streams);
  let step = walk.next(false);
  while (!step.done) {
    positions.push(step.value);
    step = walk.next(deny(step.value.operation));
  }
  return positions;
}

describe("walkByPosition", () => {
  it("interleaves two streams by position", () => {
    const steps = walkAll([
      {
        streamKey: "a",
        scope: "a",
        document: doc(),
        operations: indexed([op("a1", 1), op("a2", 3)]),
        apply: append,
      },
      {
        streamKey: "b",
        scope: "b",
        document: doc(),
        operations: indexed([op("b1", 2), op("b2", 4)]),
        apply: append,
      },
    ]);

    expect(steps.map((s) => s.operation.action.id)).toEqual([
      "a1",
      "b1",
      "a2",
      "b2",
    ]);
  });

  it("reports each stream as it stood before the operation", () => {
    const steps = walkAll([
      {
        streamKey: "a",
        scope: "a",
        document: doc(),
        operations: indexed([op("a1", 1), op("a2", 3)]),
        apply: append,
      },
      {
        streamKey: "b",
        scope: "b",
        document: doc(),
        operations: indexed([op("b1", 2)]),
        apply: append,
      },
    ]);

    // At a2 the earlier operations have been applied, a2 itself has not.
    const atA2 = steps.find((s) => s.operation.action.id === "a2")!;
    expect(applied(atA2.states.get("a")!)).toEqual(["a1"]);
    expect(applied(atA2.states.get("b")!)).toEqual(["b1"]);
  });

  it("leaves out operations a reshuffle superseded", () => {
    // What a reshuffle writes: the merged range appended, with a skip on its
    // first operation that supersedes the two rows it replaced.
    const operations = [
      { ...op("old1", 10), index: 0 },
      { ...op("old2", 11), index: 1 },
      { ...op("new1", 1), index: 2, skip: 2 },
      { ...op("new2", 2), index: 3 },
    ] as Operation[];

    const steps = walkAll([
      {
        streamKey: "a",
        scope: "a",
        document: doc(),
        operations,
        apply: append,
      },
    ]);

    expect(steps.map((s) => s.operation.action.id)).toEqual(["new1", "new2"]);
  });

  it("visits a denied operation without applying it", () => {
    const operations = indexed([
      op("a1", 1),
      op("a2", 2, { deniedReason: "no grant permits this signer" }),
      op("a3", 3),
    ]);

    const steps = walkAll([
      {
        streamKey: "a",
        scope: "a",
        document: doc(),
        operations,
        apply: append,
      },
    ]);

    expect(steps.map((s) => s.operation.action.id)).toEqual(["a1", "a2", "a3"]);
    const atA3 = steps.find((s) => s.operation.action.id === "a3")!;
    expect(applied(atA3.states.get("a")!)).toEqual(["a1"]);
  });

  // The base reducer commits a throwing operation with its message recorded, so
  // an errored row is ordinary history that contributes no state.
  it("visits an errored operation without applying it", () => {
    const operations = indexed([
      op("a1", 1),
      op("a2", 2, { error: "boom" }),
      op("a3", 3),
    ]);

    const steps = walkAll([
      {
        streamKey: "a",
        scope: "a",
        document: doc(),
        operations,
        apply: append,
      },
    ]);

    expect(steps.map((s) => s.operation.action.id)).toEqual(["a1", "a2", "a3"]);
    const atA3 = steps.find((s) => s.operation.action.id === "a3")!;
    expect(applied(atA3.states.get("a")!)).toEqual(["a1"]);
  });

  /**
   * The walk decides operations on a stream it also applies. A SET_GRANT the pass
   * itself refuses must not change the policy the rest of the pass reads, which
   * the stored deniedReason cannot express because it is not written yet.
   */
  it("does not apply an operation the consumer denied at its position", () => {
    const operations = indexed([op("a1", 1), op("a2", 2), op("a3", 3)]);

    const steps = walkDeciding(
      [
        {
          streamKey: "a",
          scope: "a",
          document: doc(),
          operations,
          apply: append,
        },
      ],
      (operation) => operation.action.id === "a2",
    );

    expect(steps.map((s) => s.operation.action.id)).toEqual(["a1", "a2", "a3"]);
    const atA3 = steps.find((s) => s.operation.action.id === "a3")!;
    expect(applied(atA3.states.get("a")!)).toEqual(["a1"]);
  });

  it("applies an operation the consumer allowed", () => {
    const operations = indexed([op("a1", 1), op("a2", 2), op("a3", 3)]);

    const steps = walkDeciding(
      [
        {
          streamKey: "a",
          scope: "a",
          document: doc(),
          operations,
          apply: append,
        },
      ],
      () => false,
    );

    const atA3 = steps.find((s) => s.operation.action.id === "a3")!;
    expect(applied(atA3.states.get("a")!)).toEqual(["a1", "a2"]);
  });

  /**
   * Spec ordering rule 2: without it, whether a grant applies at the same
   * millisecond depends on a localeCompare of two uuids.
   */
  it("puts an auth operation first in a cross-stream timestamp tie", () => {
    const sameTime = 5;

    // The auth operation wins whichever way the action ids happen to sort.
    const authLowerId = { ...op("aaa", sameTime), id: "op-1" } as Operation;
    const domainHigherId = { ...op("zzz", sameTime), id: "op-2" } as Operation;
    expect(
      comparePositions(
        { streamKey: "auth", scope: "auth", operation: authLowerId },
        { streamKey: "global", scope: "global", operation: domainHigherId },
      ),
    ).toBeLessThan(0);

    const authHigherId = { ...op("zzz", sameTime), id: "op-9" } as Operation;
    const domainLowerId = { ...op("aaa", sameTime), id: "op-1" } as Operation;
    expect(
      comparePositions(
        { streamKey: "auth", scope: "auth", operation: authHigherId },
        { streamKey: "global", scope: "global", operation: domainLowerId },
      ),
    ).toBeLessThan(0);

    // And symmetrically.
    expect(
      comparePositions(
        { streamKey: "global", scope: "global", operation: domainLowerId },
        { streamKey: "auth", scope: "auth", operation: authHigherId },
      ),
    ).toBeGreaterThan(0);
  });

  it("walks a tied auth operation before the domain operation it decides", () => {
    const sameTime = 5;
    const steps = walkAll([
      {
        streamKey: "auth",
        scope: "auth",
        document: doc(),
        operations: indexed([op("grant", sameTime)]),
        apply: append,
      },
      {
        streamKey: "global",
        scope: "global",
        document: doc(),
        operations: indexed([op("write", sameTime)]),
        apply: append,
      },
    ]);

    expect(steps.map((s) => s.operation.action.id)).toEqual(["grant", "write"]);
  });

  it("orders an equal timestamp by action id, then operation id", () => {
    const sameTime = 5;
    const a = { ...op("zzz", sameTime), id: "op-1" } as Operation;
    const b = { ...op("aaa", sameTime), id: "op-2" } as Operation;
    expect(
      comparePositions(
        { streamKey: "x", scope: "x", operation: a },
        { streamKey: "y", scope: "y", operation: b },
      ),
    ).toBeGreaterThan(0);

    const c = { ...op("same", sameTime), id: "op-9" } as Operation;
    const d = { ...op("same", sameTime), id: "op-1" } as Operation;
    expect(
      comparePositions(
        { streamKey: "x", scope: "x", operation: c },
        { streamKey: "y", scope: "y", operation: d },
      ),
    ).toBeGreaterThan(0);
  });

  it("orders identically however the streams are handed in", () => {
    const a = indexed([op("a1", 1), op("a2", 4)]);
    const b = indexed([op("b1", 2), op("b2", 3)]);

    const forwards = mergeByPosition([
      { streamKey: "a", scope: "a", operations: a },
      { streamKey: "b", scope: "b", operations: b },
    ]);
    const backwards = mergeByPosition([
      { streamKey: "b", scope: "b", operations: [...b].reverse() },
      { streamKey: "a", scope: "a", operations: [...a].reverse() },
    ]);

    expect(backwards.map((p) => p.operation.action.id)).toEqual(
      forwards.map((p) => p.operation.action.id),
    );
    expect(forwards.map((p) => p.operation.action.id)).toEqual([
      "a1",
      "b1",
      "b2",
      "a2",
    ]);
  });
});

describe("staticReadSet", () => {
  it("names each statically-queried stream and the actions that matter in it", () => {
    const readSet = staticReadSet(
      documentDecisionModel({ documentId: "d", branch: "main" }),
    );

    expect(
      readSet.map(({ query, decidingActions }) => ({ query, decidingActions })),
    ).toEqual([
      {
        query: { documentId: "d", branch: "main", scope: "document" },
        decidingActions: ["DELETE_DOCUMENT"],
      },
    ]);
    expect(typeof readSet[0].apply).toBe("function");
  });

  it("leaves out a derived query, whose streams are not known yet", () => {
    const definition = {
      projections: {
        a: {
          decidingActions: ["X"],
          apply: (document: PHDocument) => document,
          query: { documentId: "d", branch: "main", scope: "global" },
        },
        b: { decidingActions: ["Y"], query: () => [] },
      },
      evaluatesScope: () => true,
      decide: () => ({ decision: "allow" as const }),
    };

    expect(
      staticReadSet(definition as never).map((s) => s.query.scope),
    ).toEqual(["global"]);
  });
});

describe("position order guard", () => {
  it("rejects a stream whose effective operations run out of order", () => {
    const operations = [
      { ...op("late", 10), index: 0 },
      { ...op("early", 1), index: 1 },
    ] as Operation[];

    expect(() =>
      walkAll([
        {
          streamKey: "a",
          scope: "a",
          document: doc(),
          operations,
          apply: append,
        },
      ]),
    ).toThrow(/out of position order/);
  });

  it("accepts a stream a reshuffle left in order", () => {
    const operations = [
      { ...op("old", 10), index: 0 },
      { ...op("new1", 1), index: 1, skip: 1 },
      { ...op("new2", 2), index: 2 },
    ] as Operation[];

    expect(
      walkAll([
        {
          streamKey: "a",
          scope: "a",
          document: doc(),
          operations,
          apply: append,
        },
      ]).map((s) => s.operation.action.id),
    ).toEqual(["new1", "new2"]);
  });

  it("keeps stored order for two operations sharing a timestamp", () => {
    const same = 5;
    const operations = [
      { ...op("zzz", same), index: 0 },
      { ...op("aaa", same), index: 1 },
    ] as Operation[];

    expect(
      walkAll([
        {
          streamKey: "a",
          scope: "a",
          document: doc(),
          operations,
          apply: append,
        },
      ]).map((s) => s.operation.action.id),
    ).toEqual(["zzz", "aaa"]);
  });
});
