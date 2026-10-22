// Tests for the pure vendor-import normalization: the dynamic-base
// placeholder is resolved against the runtime base and values become
// absolute URLs; concrete-base values pass through (still made absolute).

import { describe, expect, it } from "vitest";
import {
  normalizeVendorImports,
  sharedDepsModuleUrl,
  sharedImportsFromImportMap,
} from "./shared-deps.js";

describe("sharedDepsModuleUrl", () => {
  it("falls back to the stable dev path when the build sets no hashed URL", () => {
    expect(sharedDepsModuleUrl("/app/")).toBe("/app/__vendor__/shared-deps.js");
  });

  it("keeps a concrete subpath base's URL as built", () => {
    const url = "/connect/__vendor__/shared-deps-abc.js";
    expect(sharedDepsModuleUrl("/connect/", url)).toBe(url);
  });

  it("keeps a root base's URL as built", () => {
    const url = "/__vendor__/shared-deps-abc.js";
    expect(sharedDepsModuleUrl("/", url)).toBe(url);
  });

  it("resolves a dynamic-base build's placeholder to the runtime base", () => {
    expect(
      sharedDepsModuleUrl(
        "/app/",
        "/__PH_DYNAMIC_BASE__/__vendor__/shared-deps-abc.js",
      ),
    ).toBe("/app/__vendor__/shared-deps-abc.js");
  });
});

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

  it("does not prefix a concrete subpath base twice", () => {
    expect(
      normalizeVendorImports(
        { zod: "/connect/__vendor__/zod-x.js" },
        "/connect/",
      ),
    ).toEqual({ zod: "http://localhost/connect/__vendor__/zod-x.js" });
  });

  it("handles an empty table", () => {
    expect(normalizeVendorImports({}, "/app/")).toEqual({});
  });
});

describe("sharedImportsFromImportMap", () => {
  const PAGE = "http://localhost:3000/app/";

  it("keeps the shared deps' exact and prefix entries, made absolute", () => {
    const importMap = JSON.stringify({
      imports: {
        react: "/__ph/dev-react-shim/react.js?v=1",
        "document-model": "/app/@id/__x00__ph-shared:document-model",
        "document-model/": "/app/@id/__x00__ph-shared:document-model/",
        "zod/v4": "/app/@id/__x00__ph-shared:zod/v4",
        "ph-bundled-packages-virtual": "/app/@id/virtual",
      },
    });

    expect(sharedImportsFromImportMap(importMap, PAGE)).toEqual({
      "document-model":
        "http://localhost:3000/app/@id/__x00__ph-shared:document-model",
      "document-model/":
        "http://localhost:3000/app/@id/__x00__ph-shared:document-model/",
      "zod/v4": "http://localhost:3000/app/@id/__x00__ph-shared:zod/v4",
    });
  });

  it("is empty without an import map, or with one that doesn't parse", () => {
    expect(sharedImportsFromImportMap(null, PAGE)).toEqual({});
    expect(sharedImportsFromImportMap("{", PAGE)).toEqual({});
  });
});
