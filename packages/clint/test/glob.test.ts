import { describe, it, expect } from "vitest";
import { compileGlob, matchAny } from "../src/core/glob.js";

describe("compileGlob", () => {
  it("anchors patterns to the full string", () => {
    const re = compileGlob("foo");
    expect(re.test("foo")).toBe(true);
    expect(re.test("foobar")).toBe(false);
    expect(re.test("xfoo")).toBe(false);
  });

  it("`*` matches any run of characters including empty", () => {
    const re = compileGlob("foo*");
    expect(re.test("foo")).toBe(true);
    expect(re.test("foobar")).toBe(true);
    expect(re.test("foo-bar-baz")).toBe(true);
  });

  it("`*` crosses `-` and `__` boundaries (flat strings, not path-segmented)", () => {
    expect(compileGlob("clint-*").test("clint-project-init")).toBe(true);
    expect(compileGlob("*-mcp__*").test("reactor-mcp__addActions")).toBe(true);
    expect(
      compileGlob("*-mcp__*").test(
        "clint-project-service-mcp__getDocumentModel",
      ),
    ).toBe(true);
  });

  it("`?` matches exactly one character", () => {
    const re = compileGlob("fo?");
    expect(re.test("foo")).toBe(true);
    expect(re.test("fox")).toBe(true);
    expect(re.test("fo")).toBe(false);
    expect(re.test("food")).toBe(false);
  });

  it("character classes `[abc]` pass through to regex", () => {
    const re = compileGlob("foo[12]");
    expect(re.test("foo1")).toBe(true);
    expect(re.test("foo2")).toBe(true);
    expect(re.test("foo3")).toBe(false);
  });

  it("escapes regex metacharacters in literal segments", () => {
    expect(compileGlob("a.b").test("a.b")).toBe(true);
    expect(compileGlob("a.b").test("axb")).toBe(false);
    expect(compileGlob("a+b").test("a+b")).toBe(true);
    expect(compileGlob("a(b)").test("a(b)")).toBe(true);
  });

  it("unbalanced `[` is treated as a literal bracket", () => {
    expect(compileGlob("foo[").test("foo[")).toBe(true);
  });
});

describe("matchAny", () => {
  it("returns true if at least one pattern matches", () => {
    expect(
      matchAny("clint-project-init", ["clint-project-*", "*-mcp__*"]),
    ).toBe(true);
    expect(
      matchAny("reactor-mcp__addActions", ["clint-project-*", "*-mcp__*"]),
    ).toBe(true);
  });

  it("returns false when no pattern matches", () => {
    expect(matchAny("config", ["clint-project-*", "*-mcp__*"])).toBe(false);
  });

  it("returns false for an empty pattern list", () => {
    expect(matchAny("anything", [])).toBe(false);
  });
});
