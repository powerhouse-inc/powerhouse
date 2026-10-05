// Tests for the pure vendor-import normalization: the dynamic-base
// placeholder is resolved against the runtime base and values become
// absolute URLs; concrete-base values pass through (still made absolute).

import { describe, expect, it } from "vitest";
import { normalizeVendorImports } from "./shared-deps.js";

describe("normalizeVendorImports", () => {
  it("resolves the dynamic-base placeholder and makes values absolute", () => {
    const out = normalizeVendorImports(
      { "document-model": "/__PH_DYNAMIC_BASE__/__vendor__/document-model.js" },
      "/app/",
    );
    expect(out).toEqual({
      "document-model": "http://localhost/app/__vendor__/document-model.js",
    });
  });

  it("makes concrete-base values absolute against the page origin", () => {
    const out = normalizeVendorImports(
      { "@powerhousedao/shared": "/app/__vendor__/@powerhousedao/shared.js" },
      "/app/",
    );
    expect(out["@powerhousedao/shared"]).toBe(
      "http://localhost/app/__vendor__/@powerhousedao/shared.js",
    );
  });

  it("leaves values untouched apart from absolutization when no placeholder", () => {
    const out = normalizeVendorImports(
      { a: "/__vendor__/a.js", b: "/__vendor__/b.js" },
      "/",
    );
    expect(out).toEqual({
      a: "http://localhost/__vendor__/a.js",
      b: "http://localhost/__vendor__/b.js",
    });
  });

  it("handles an empty table", () => {
    expect(normalizeVendorImports({}, "/app/")).toEqual({});
  });
});
