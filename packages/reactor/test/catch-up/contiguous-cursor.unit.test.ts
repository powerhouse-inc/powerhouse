import { describe, expect, it } from "vitest";
import { ContiguousCursor } from "../../src/catch-up/contiguous-cursor.js";

describe("ContiguousCursor", () => {
  it("drops ordinals at or below the cursor and ones already claimed", () => {
    const cursor = new ContiguousCursor(5, 100);

    expect([...cursor.claim([4, 5, 6, 7])]).toEqual([6, 7]);
    expect([...cursor.claim([6, 7, 8])]).toEqual([8]);

    cursor.settle([6], true);
    expect([...cursor.claim([6])]).toEqual([]);

    cursor.settle([7], false);
    expect([...cursor.claim([7])]).toEqual([7]);
  });

  it("holds the target below the lowest claimed and unapplied ordinal", () => {
    const cursor = new ContiguousCursor(0, 100);
    cursor.claim([1, 2, 4]);
    cursor.settle([1, 2], true);

    expect(cursor.target(10, [1, 2, 4, 6])).toBe(3);

    cursor.settle([4], true);
    expect(cursor.target(10, [1, 2, 4, 6])).toBe(5);
    expect(cursor.missing([1, 2, 4, 6])).toEqual([6]);

    cursor.claim([6]);
    cursor.settle([6], true);
    expect(cursor.target(10, [1, 2, 4, 6])).toBe(10);
    expect(cursor.target(5, [1, 2, 4, 6])).toBe(5);
  });

  it("never targets below the cursor", () => {
    const cursor = new ContiguousCursor(8, 100);
    expect(cursor.target(4, [])).toBe(8);
    expect(cursor.target(20, [9])).toBe(8);
  });

  it("prunes what it tracks as it advances", () => {
    const cursor = new ContiguousCursor(0, 100);
    cursor.claim([1, 2, 3]);
    cursor.settle([1, 2, 3], true);
    expect(cursor.trackedAbove).toBe(3);

    cursor.advance(2);
    expect(cursor.appliedThrough).toBe(2);
    expect(cursor.trackedAbove).toBe(1);

    cursor.advance(1);
    expect(cursor.appliedThrough).toBe(2);
  });

  it("re-applies the range once after overflow", () => {
    const cursor = new ContiguousCursor(0, 3);
    cursor.claim([1, 2, 3]);
    cursor.settle([1, 2, 3], true);
    cursor.enforceLimit();
    expect(cursor.missing([1, 2, 3])).toEqual([]);

    cursor.claim([5]);
    cursor.settle([5], true);
    cursor.enforceLimit();
    expect(cursor.trackedAbove).toBe(0);
    expect(cursor.missing([1, 2, 3, 5])).toEqual([1, 2, 3, 5]);

    const again = cursor.claim(cursor.missing([1, 2, 3, 5]));
    cursor.settle(again, true);
    expect(cursor.missing([1, 2, 3, 5])).toEqual([]);
    cursor.advance(cursor.target(5, [1, 2, 3, 5]));
    cursor.enforceLimit();
    expect(cursor.appliedThrough).toBe(5);
  });
});
