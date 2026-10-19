import { describe, it, expect } from "vitest";
import { z } from "zod";
import { formatZodError } from "../src/core/errors.js";

describe("formatZodError", () => {
  it("formats a ZodError with a single issue", () => {
    const schema = z.object({ name: z.string() });
    let err: unknown;
    try {
      schema.parse({});
    } catch (e) {
      err = e;
    }
    const result = formatZodError(err);
    expect(result).toContain("Validation error");
    expect(result).toContain("--name");
  });

  it("formats a ZodError with multiple issues", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    let err: unknown;
    try {
      schema.parse({});
    } catch (e) {
      err = e;
    }
    const result = formatZodError(err);
    const lines = result.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 issues
    expect(result).toContain("--name");
    expect(result).toContain("--age");
  });

  it("includes command name in header when commandId is provided", () => {
    const schema = z.object({ name: z.string() });
    let err: unknown;
    try {
      schema.parse({});
    } catch (e) {
      err = e;
    }
    const result = formatZodError(err, "my-command");
    expect(result).toContain("Invalid arguments for 'my-command'");
  });

  it("falls back to err.message for non-ZodError", () => {
    const err = new Error("something went wrong");
    expect(formatZodError(err)).toBe("something went wrong");
  });

  it("falls back to String() for non-Error", () => {
    expect(formatZodError("raw string")).toBe("raw string");
    expect(formatZodError(42)).toBe("42");
  });

  it("uses (input) for path-less issues", () => {
    const schema = z.string();
    let err: unknown;
    try {
      schema.parse(123);
    } catch (e) {
      err = e;
    }
    const result = formatZodError(err);
    expect(result).toContain("(input)");
  });
});
