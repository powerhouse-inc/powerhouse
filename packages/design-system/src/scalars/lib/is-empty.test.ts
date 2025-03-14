import { describe, it, expect } from "vitest";
import { isEmpty } from "./is-empty.js";

describe("isEmpty", () => {
  // Null/undefined cases
  it("should return true for null", () => {
    expect(isEmpty(null)).toBe(true);
  });

  it("should return true for undefined", () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  // Boolean cases
  it("should return false for true", () => {
    expect(isEmpty(true)).toBe(false);
  });

  it("should return false for false", () => {
    expect(isEmpty(false)).toBe(false);
  });

  // Number cases
  it("should return false for non-zero numbers", () => {
    expect(isEmpty(42)).toBe(false);
  });

  it("should return false for zero", () => {
    expect(isEmpty(0)).toBe(false);
  });

  it("should return true for NaN", () => {
    expect(isEmpty(NaN)).toBe(true);
  });

  // String cases
  it("should return true for empty string", () => {
    expect(isEmpty("")).toBe(true);
  });

  it("should return false for non-empty string", () => {
    expect(isEmpty("hello")).toBe(false);
  });

  it("should return false for string with spaces", () => {
    expect(isEmpty("   ")).toBe(false);
  });

  // Array cases
  it("should return true for empty array", () => {
    expect(isEmpty([])).toBe(true);
  });

  it("should return false for non-empty array", () => {
    expect(isEmpty([1, 2, 3])).toBe(false);
  });

  it("should return false for array with undefined values", () => {
    expect(isEmpty([undefined])).toBe(false);
  });

  // Object cases
  it("should return true for empty object", () => {
    expect(isEmpty({})).toBe(true);
  });

  it("should return false for non-empty object", () => {
    expect(isEmpty({ key: "value" })).toBe(false);
  });

  it("should return false for object with null values", () => {
    expect(isEmpty({ key: null })).toBe(false);
  });

  // Map cases
  it("should return true for empty Map", () => {
    expect(isEmpty(new Map())).toBe(true);
  });

  it("should return false for non-empty Map", () => {
    const map = new Map();
    map.set("key", "value");
    expect(isEmpty(map)).toBe(false);
  });

  // Set cases
  it("should return true for empty Set", () => {
    expect(isEmpty(new Set())).toBe(true);
  });

  it("should return false for non-empty Set", () => {
    const set = new Set();
    set.add("value");
    expect(isEmpty(set)).toBe(false);
  });

  // Edge cases
  it("should return false for Date object", () => {
    expect(isEmpty(new Date())).toBe(false);
  });

  it("should return false for RegExp", () => {
    expect(isEmpty(/test/)).toBe(false);
  });

  it("should return false for functions", () => {
    expect(isEmpty(() => {})).toBe(false);
  });
});
