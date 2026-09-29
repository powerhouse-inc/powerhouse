import { describe, expect, it } from "vitest";
import {
  convertVariableValue,
  parseTypedValue,
  valueMismatch,
} from "./variable-types.js";

describe("parseTypedValue", () => {
  it("parses a number in plain decimal only", () => {
    expect(parseTypedValue("NUMBER", " 42.5 ")).toEqual({
      ok: true,
      value: 42.5,
    });
    expect(parseTypedValue("NUMBER", "0x10")).toEqual({
      ok: false,
      error: "Not a number",
    });
    expect(parseTypedValue("NUMBER", "1e3").ok).toBe(false);
  });

  it("keeps text as typed and reports broken JSON", () => {
    expect(parseTypedValue("TEXT", "007")).toEqual({ ok: true, value: "007" });
    expect(parseTypedValue("JSON", '{"a":1}')).toEqual({
      ok: true,
      value: { a: 1 },
    });
    const broken = parseTypedValue("JSON", "{a:");
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.error).toMatch(/^Not valid JSON/);
  });
});

describe("convertVariableValue", () => {
  it("converts where it can and keeps the value otherwise", () => {
    expect(convertVariableValue("12", "TEXT", "NUMBER")).toBe(12);
    expect(convertVariableValue("twelve", "TEXT", "NUMBER")).toBe("twelve");
    expect(convertVariableValue(12, "NUMBER", "TEXT")).toBe("12");
    expect(convertVariableValue("true", "TEXT", "BOOLEAN")).toBe(true);
  });

  it("never turns a value into a secret reference or back", () => {
    expect(convertVariableValue("hunter2", "TEXT", "SECRET")).toBeNull();
    expect(
      convertVariableValue("secret://v1:abc", "SECRET", "TEXT"),
    ).toBeNull();
  });

  it("flags a stored value its type rejects", () => {
    expect(valueMismatch("NUMBER", "twelve")).toBe("Not a number");
    expect(valueMismatch("NUMBER", 12)).toBeNull();
    expect(valueMismatch("JSON", "anything")).toBeNull();
  });
});
