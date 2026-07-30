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

describe("walkByPosition", () => {
  it("interleaves two streams by position", () => {
    const steps = [
      ...walkByPosition([
        {
          streamKey: "a",
          document: doc(),
          operations: indexed([op("a1", 1), op("a2", 3)]),
          apply: append,
        },
        {
          streamKey: "b",
          document: doc(),
          operations: indexed([op("b1", 2), op("b2", 4)]),
          apply: append,
        },
      ]),
    ];

    expect(steps.map((s) => s.operation.action.id)).toEqual([
      "a1",
      "b1",
      "a2",
      "b2",
    ]);
  });

  it("reports each stream as it stood before the operation", () => {
    const steps = [
      ...walkByPosition([
        {
          streamKey: "a",
          document: doc(),
          operations: indexed([op("a1", 1), op("a2", 3)]),
          apply: append,
        },
        {
          streamKey: "b",
          document: doc(),
          operations: indexed([op("b1", 2)]),
          apply: append,
        },
      ]),
    ];

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

    const steps = [
      ...walkByPosition([
        { streamKey: "a", document: doc(), operations, apply: append },
      ]),
    ];

    expect(steps.map((s) => s.operation.action.id)).toEqual(["new1", "new2"]);
  });

  it("visits a denied operation without applying it", () => {
    const operations = indexed([
      op("a1", 1),
      op("a2", 2, { deniedReason: "no grant permits this signer" }),
      op("a3", 3),
    ]);

    const steps = [
      ...walkByPosition([
        { streamKey: "a", document: doc(), operations, apply: append },
      ]),
    ];

    expect(steps.map((s) => s.operation.action.id)).toEqual(["a1", "a2", "a3"]);
    const atA3 = steps.find((s) => s.operation.action.id === "a3")!;
    expect(applied(atA3.states.get("a")!)).toEqual(["a1"]);
  });

  it("orders an equal timestamp by action id, then operation id", () => {
    const sameTime = 5;
    const a = { ...op("zzz", sameTime), id: "op-1" } as Operation;
    const b = { ...op("aaa", sameTime), id: "op-2" } as Operation;
    expect(
      comparePositions(
        { streamKey: "x", operation: a },
        { streamKey: "y", operation: b },
      ),
    ).toBeGreaterThan(0);

    const c = { ...op("same", sameTime), id: "op-9" } as Operation;
    const d = { ...op("same", sameTime), id: "op-1" } as Operation;
    expect(
      comparePositions(
        { streamKey: "x", operation: c },
        { streamKey: "y", operation: d },
      ),
    ).toBeGreaterThan(0);
  });

  it("orders identically however the streams are handed in", () => {
    const a = indexed([op("a1", 1), op("a2", 4)]);
    const b = indexed([op("b1", 2), op("b2", 3)]);

    const forwards = mergeByPosition([
      { streamKey: "a", operations: a },
      { streamKey: "b", operations: b },
    ]);
    const backwards = mergeByPosition([
      { streamKey: "b", operations: [...b].reverse() },
      { streamKey: "a", operations: [...a].reverse() },
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
      judgesScope: () => true,
      decide: () => "allow" as const,
    };

    expect(
      staticReadSet(definition as never).map((s) => s.query.scope),
    ).toEqual(["global"]);
  });
});
