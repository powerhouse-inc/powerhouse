import { describe, expect, it } from "vitest";
import type { ErrorInfo } from "../../../../src/executor/worker/protocol.js";
import {
  errorToInfo,
  sanitizeArg,
} from "../../../../src/executor/worker/sanitize.js";

describe("sanitizeArg", () => {
  describe("primitives", () => {
    it("passes through null", () => {
      expect(sanitizeArg(null)).toBe(null);
    });

    it("passes through undefined as null", () => {
      expect(sanitizeArg(undefined)).toBe(null);
    });

    it("passes through booleans", () => {
      expect(sanitizeArg(true)).toBe(true);
      expect(sanitizeArg(false)).toBe(false);
    });

    it("passes through numbers", () => {
      expect(sanitizeArg(42)).toBe(42);
      expect(sanitizeArg(-1.5)).toBe(-1.5);
      expect(sanitizeArg(NaN)).toBeNaN();
    });

    it("passes through strings", () => {
      expect(sanitizeArg("hello")).toBe("hello");
    });

    it("converts BigInt to string", () => {
      expect(sanitizeArg(BigInt(9007199254740991))).toBe("9007199254740991");
    });

    it("drops functions to null", () => {
      expect(sanitizeArg(() => {})).toBe(null);
    });

    it("drops symbols to null", () => {
      expect(sanitizeArg(Symbol("test"))).toBe(null);
    });
  });

  describe("arrays", () => {
    it("sanitizes array elements", () => {
      expect(sanitizeArg([1, "two", null])).toEqual([1, "two", null]);
    });

    it("handles nested arrays", () => {
      expect(sanitizeArg([[1, 2], [3]])).toEqual([[1, 2], [3]]);
    });

    it("drops functions and symbols inside arrays", () => {
      expect(sanitizeArg([() => {}, Symbol("s"), 1])).toEqual([null, null, 1]);
    });
  });

  describe("plain objects", () => {
    it("sanitizes plain object fields", () => {
      expect(sanitizeArg({ a: 1, b: "hello" })).toEqual({ a: 1, b: "hello" });
    });

    it("handles nested plain objects", () => {
      expect(sanitizeArg({ x: { y: 42 } })).toEqual({ x: { y: 42 } });
    });

    it("drops function values", () => {
      expect(sanitizeArg({ fn: () => {}, n: 1 })).toEqual({ fn: null, n: 1 });
    });
  });

  describe("circular references", () => {
    it("replaces circular array reference with '[Circular]'", () => {
      const arr: unknown[] = [1];
      arr.push(arr);
      const result = sanitizeArg(arr) as unknown[];
      expect(result[0]).toBe(1);
      expect(result[1]).toBe("[Circular]");
    });

    it("replaces circular object reference with '[Circular]'", () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj["self"] = obj;
      const result = sanitizeArg(obj) as Record<string, unknown>;
      expect(result["a"]).toBe(1);
      expect(result["self"]).toBe("[Circular]");
    });

    it("allows the same object to appear in multiple non-circular positions", () => {
      const inner = { v: 1 };
      const outer = { x: inner, y: inner };
      const result = sanitizeArg(outer) as Record<string, unknown>;
      expect(result["x"]).toEqual({ v: 1 });
      expect(result["y"]).toEqual({ v: 1 });
    });
  });

  describe("Error instances", () => {
    it("converts Error to ErrorInfo", () => {
      const err = new Error("oops");
      const result = sanitizeArg(err) as ErrorInfo;
      expect(result.name).toBe("Error");
      expect(result.message).toBe("oops");
      expect(typeof result.stack).toBe("string");
    });

    it("includes cause chain", () => {
      const cause = new Error("root cause");
      const err = new Error("outer", { cause });
      const result = sanitizeArg(err) as ErrorInfo;
      expect(result.cause?.message).toBe("root cause");
    });
  });

  describe("class instances", () => {
    it("replaces class instances with __nonClonable marker", () => {
      class MyClass {
        value = 42;
      }
      const result = sanitizeArg(new MyClass()) as Record<string, unknown>;
      expect(result["__nonClonable"]).toBe("MyClass");
    });

    it("uses 'Unknown' for anonymous classes", () => {
      const AnonClass = class {};
      Object.defineProperty(AnonClass, "name", { value: "" });
      const result = sanitizeArg(
        Object.create({ constructor: { name: "" } }),
      ) as Record<string, unknown>;
      expect(result["__nonClonable"]).toBe("Unknown");
    });
  });

  describe("special objects", () => {
    it("converts Date to ISO string", () => {
      const d = new Date("2024-01-01T00:00:00.000Z");
      expect(sanitizeArg(d)).toBe("2024-01-01T00:00:00.000Z");
    });

    it("converts Map to plain object", () => {
      const m = new Map([
        ["a", 1],
        ["b", 2],
      ]);
      expect(sanitizeArg(m)).toEqual({ a: 1, b: 2 });
    });

    it("converts Set to array", () => {
      const s = new Set([1, 2, 3]);
      expect(sanitizeArg(s)).toEqual([1, 2, 3]);
    });
  });

  describe("depth cap", () => {
    it("truncates deeply nested objects without throwing", () => {
      let deep: Record<string, unknown> = { val: "leaf" };
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep };
      }
      expect(() => sanitizeArg(deep)).not.toThrow();
      const result = sanitizeArg(deep);
      expect(result).not.toBeNull();
    });

    it("returns '[Truncated]' at the depth cap", () => {
      let deep: Record<string, unknown> = { val: "leaf" };
      for (let i = 0; i < 10; i++) {
        deep = { nested: deep };
      }
      const str = JSON.stringify(sanitizeArg(deep));
      expect(str).toContain("[Truncated]");
    });
  });

  describe("structured-clone safety", () => {
    it("sanitized output passes structuredClone for error with cause chain", () => {
      const cause = new TypeError("inner");
      const err = new Error("outer", { cause });
      const sanitized = sanitizeArg(err);
      expect(() => structuredClone(sanitized)).not.toThrow();
    });

    it("sanitized output passes structuredClone for circular object", () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj["self"] = obj;
      const sanitized = sanitizeArg(obj);
      expect(() => structuredClone(sanitized)).not.toThrow();
    });

    it("sanitized output passes structuredClone for class instance", () => {
      class Foo {
        x = 1;
      }
      const sanitized = sanitizeArg(new Foo());
      expect(() => structuredClone(sanitized)).not.toThrow();
    });
  });
});

describe("errorToInfo", () => {
  it("converts Error to ErrorInfo", () => {
    const err = new Error("test error");
    const info = errorToInfo(err);
    expect(info.name).toBe("Error");
    expect(info.message).toBe("test error");
    expect(typeof info.stack).toBe("string");
  });

  it("includes cause chain", () => {
    const cause = new RangeError("range");
    const err = new Error("outer", { cause });
    const info = errorToInfo(err);
    expect(info.cause?.name).toBe("RangeError");
    expect(info.cause?.message).toBe("range");
  });

  it("handles non-Error values", () => {
    const info = errorToInfo("plain string error");
    expect(info.name).toBe("Error");
    expect(info.message).toBe("plain string error");
  });

  it("handles unknown thrown values", () => {
    const info = errorToInfo({ code: 42 });
    expect(info.name).toBe("Error");
    expect(typeof info.message).toBe("string");
  });

  it("output passes structuredClone", () => {
    const err = new Error("test", { cause: new TypeError("inner") });
    const info = errorToInfo(err);
    expect(() => structuredClone(info)).not.toThrow();
  });
});
