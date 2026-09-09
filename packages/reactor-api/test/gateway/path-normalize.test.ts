import { match } from "path-to-regexp";
import { describe, expect, it } from "vitest";
import { normalizePath } from "../../src/graphql/gateway/path-normalize.js";

/**
 * `normalizePath` rewrites route patterns for path-to-regexp v8. The critical
 * case is the legacy optional-param syntax `/:param?` (used by the GraphiQL
 * explorer route `${prefix}/:endpoint?`): v8 rejects a bare `:param?`, and
 * the only equivalent is a group whose content begins with `/` (`{/:param}`).
 * A wrong conversion compiles to a pattern that matches nothing, turning
 * every request to the route into a 404.
 */
describe("normalizePath", () => {
  it("collapses duplicate slashes", () => {
    expect(normalizePath("//explorer")).toBe("/explorer");
    expect(normalizePath("/a//b///c")).toBe("/a/b/c");
  });

  it("leaves regular params untouched", () => {
    expect(normalizePath("/a/:b/c")).toBe("/a/:b/c");
  });

  it("moves the slash inside the group for optional trailing params", () => {
    expect(normalizePath("/explorer/:endpoint?")).toBe("/explorer{/:endpoint}");
  });

  it("produces a pattern that matches both the bare prefix and the segment", () => {
    const m = match(normalizePath("/explorer/:endpoint?"));
    expect(m("/explorer")).not.toBe(false);
    const withSegment = m("/explorer/graphql");
    expect(withSegment).not.toBe(false);
    if (withSegment) {
      expect(withSegment.params.endpoint).toBe("graphql");
    }
    expect(m("/other")).toBe(false);
  });
});
