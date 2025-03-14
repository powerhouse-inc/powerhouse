import { describe, it, expect } from "vitest";
import { deepEqual } from "./deep-equal.js";

describe("deepEqual", () => {
  it("should return true for identical primitive values", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("test", "test")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("should return false for different primitive values", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("test", "test2")).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("should return false for values of different types", () => {
    expect(deepEqual(1, "1")).toBe(false);
    expect(deepEqual(0, false)).toBe(false);
    expect(deepEqual("", false)).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });

  it("should handle arrays correctly", () => {
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
    expect(deepEqual([1, { a: 1 }], [1, { a: 1 }])).toBe(true);
  });

  it("should handle objects correctly", () => {
    expect(deepEqual({}, {})).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("should handle nested objects correctly", () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(deepEqual({ a: { b: { c: 3 } } }, { a: { b: { c: 3 } } })).toBe(
      true,
    );
  });

  it("should handle mixed nested structures correctly", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual([{ a: 1 }, [2, 3]], [{ a: 1 }, [2, 3]])).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });

  it("should handle edge cases correctly", () => {
    expect(deepEqual(NaN, NaN)).toBe(false);
    expect(deepEqual(-0, +0)).toBe(true);
    expect(deepEqual(Infinity, Infinity)).toBe(true);
    expect(deepEqual(-Infinity, -Infinity)).toBe(true);
    expect(deepEqual(-Infinity, Infinity)).toBe(false);
  });

  it("should handle circular references", () => {
    const obj1: Record<string, unknown> = { a: 1 };
    const obj2: Record<string, unknown> = { a: 1 };
    obj1.self = obj1;
    obj2.self = obj2;
    expect(deepEqual(obj1, obj2)).toBe(true);

    const arr1: any[] = [1];
    const arr2: any[] = [1];
    arr1.push(arr1);
    arr2.push(arr2);
    expect(deepEqual(arr1, arr2)).toBe(true);
  });
});
