import type { Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { retractionSkip } from "../../src/decision/merged-order.js";

/**
 * Re-evaluation re-appends a tail and puts a skip on its first operation so the
 * copies it replaces stop counting. This checks that arithmetic against the real
 * garbage collector, including the case where the number of operations retracted
 * and the distance spanned are not the same number.
 */
function op(index: number, skip: number, name: string): Operation {
  return {
    id: `op-${name}-${index}`,
    index,
    skip,
    hash: `h-${index}`,
    timestampUtcMs: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    action: {
      id: `a-${name}`,
      type: "ADD_MODULE",
      scope: "global",
      timestampUtcMs: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      input: { id: name },
    },
  } as Operation;
}

function surviving(operations: Operation[]): number[] {
  return garbageCollect(sortOperations([...operations])).map((o) => o.index);
}

/** What re-appending `tail` at `nextIndex` leaves standing, for a given skip. */
function afterReappend(
  stored: Operation[],
  tail: Operation[],
  nextIndex: number,
  skip: number,
): number[] {
  const reappended = tail.map((_, i) =>
    op(nextIndex + i, i === 0 ? skip : 0, `re-${i}`),
  );
  return surviving([...stored, ...reappended]);
}

describe("retraction skip", () => {
  it("spans from the first retracted operation to where the tail lands", () => {
    expect(retractionSkip(3, 0)).toBe(3);
    expect(retractionSkip(2, 1)).toBe(1);
  });

  it("agrees with the count while the indices run without gaps", () => {
    // Stored 0,1,2 and retracting from 1 means two operations and a span of two.
    const stored = [op(0, 0, "a"), op(1, 0, "b"), op(2, 0, "c")];
    const tail = stored.slice(1);

    expect(retractionSkip(3, tail[0].index)).toBe(tail.length);
    expect(
      afterReappend(stored, tail, 3, retractionSkip(3, tail[0].index)).length,
    ).toBe(3);
  });

  it("retracts every replaced copy once the stream has a gap", () => {
    // What a pass leaves behind: 1 superseded, so 0 and 2 stand.
    const stored = [op(0, 0, "a"), op(1, 0, "b"), op(2, 1, "b-again")];
    expect(surviving(stored)).toEqual([0, 2]);

    // A second pass retracts from the very first operation, so it has to span
    // the gap. Two operations are retracted, but the distance is three.
    const tail = garbageCollect(sortOperations([...stored]));
    const nextIndex = 3;

    expect(retractionSkip(nextIndex, tail[0].index)).toBe(3);
    expect(tail.length).toBe(2);

    // Spanning the distance leaves only the re-appended pair.
    expect(
      afterReappend(
        stored,
        tail,
        nextIndex,
        retractionSkip(nextIndex, tail[0].index),
      ),
    ).toEqual([3, 4]);

    // Using the count instead leaves the original standing beside its own
    // replacement, so that operation would be applied twice.
    expect(afterReappend(stored, tail, nextIndex, tail.length)).toEqual([
      0, 3, 4,
    ]);
  });
});
