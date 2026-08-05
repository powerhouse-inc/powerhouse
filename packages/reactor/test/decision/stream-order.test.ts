import type { Operation } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { firstOutOfOrderPair } from "../../src/decision/stream-order.js";

function op(
  actionId: string,
  seconds: number,
  extra: Partial<Operation> = {},
): Operation {
  const timestampUtcMs = new Date(
    Date.UTC(2026, 0, 1, 0, 0, seconds),
  ).toISOString();
  return {
    id: `op-${actionId}`,
    index: extra.index ?? 0,
    skip: extra.skip ?? 0,
    timestampUtcMs,
    hash: `h-${actionId}`,
    action: {
      id: actionId,
      type: "SET_GRANT",
      scope: "auth",
      timestampUtcMs,
      input: {},
    },
    ...extra,
  } as Operation;
}

/**
 * The auth stream is never reshuffled once the monotonic rule is on, so a stream
 * that predates it and runs out of order cannot be repaired by the write path.
 */
describe("firstOutOfOrderPair", () => {
  it("reports nothing for an ordered stream", () => {
    const operations = [
      { ...op("a", 1), index: 0 },
      { ...op("b", 2), index: 1 },
      { ...op("c", 3), index: 2 },
    ] as Operation[];

    expect(firstOutOfOrderPair(operations)).toBeUndefined();
  });

  it("reports nothing for an empty stream", () => {
    expect(firstOutOfOrderPair([])).toBeUndefined();
  });

  it("names the first pair whose stored order contradicts its timestamps", () => {
    const operations = [
      { ...op("late", 10), index: 0 },
      { ...op("early", 1), index: 1 },
    ] as Operation[];

    const pair = firstOutOfOrderPair(operations);

    expect(pair?.previous.action.id).toBe("late");
    expect(pair?.current.action.id).toBe("early");
  });

  // A reshuffle leaves both orders stored while the effective ones are ordered.
  it("accepts a stream a reshuffle left in order", () => {
    const operations = [
      { ...op("old", 10), index: 0 },
      { ...op("new1", 1), index: 1, skip: 1 },
      { ...op("new2", 2), index: 2 },
    ] as Operation[];

    expect(firstOutOfOrderPair(operations)).toBeUndefined();
  });

  it("ignores a superseded row that would look out of order on its own", () => {
    const operations = [
      { ...op("superseded", 99), index: 0 },
      { ...op("replacement", 1), index: 1, skip: 1 },
    ] as Operation[];

    expect(firstOutOfOrderPair(operations)).toBeUndefined();
  });

  it("reports a tie only when strictness is asked for", () => {
    const operations = [
      { ...op("first", 5), index: 0 },
      { ...op("second", 5), index: 1 },
    ] as Operation[];

    expect(firstOutOfOrderPair(operations)).toBeUndefined();
    expect(
      firstOutOfOrderPair(operations, { requireStrict: true }),
    ).toMatchObject({
      kind: "tied",
      previous: { index: 0 },
      current: { index: 1 },
    });
  });

  it("reports descent whether or not strictness is asked for", () => {
    const operations = [
      { ...op("late", 10), index: 0 },
      { ...op("early", 1), index: 1 },
    ] as Operation[];

    expect(firstOutOfOrderPair(operations)).toMatchObject({
      kind: "descending",
      previous: { index: 0 },
      current: { index: 1 },
    });
    expect(
      firstOutOfOrderPair(operations, { requireStrict: true }),
    ).toMatchObject({
      kind: "descending",
      previous: { index: 0 },
      current: { index: 1 },
    });
  });
});
