import { describe, expect, it } from "vitest";
import {
  checkSharedDeps,
  findSharedImports,
  formatSharedDepWarnings,
  parseDepSpec,
  rewritePackageSource,
  SHARED_DEP_SPECIFIERS,
} from "./shared-deps.js";

describe("parseDepSpec", () => {
  const cases: Array<[spec: string, pkg: string, sub: string]> = [
    ["document-model", "document-model", ""],
    ["@powerhousedao/shared", "@powerhousedao/shared", ""],
    ["@powerhousedao/shared/registry/urls", "@powerhousedao/shared", "registry/urls"],
    ["@powerhousedao/reactor-browser/rpc", "@powerhousedao/reactor-browser", "rpc"],
  ];

  for (const [spec, pkg, sub] of cases) {
    it(`${spec} → ${pkg}${sub ? "/" + sub : ""}`, () => {
      expect(parseDepSpec(spec)).toEqual({ pkg, sub });
    });
  }
});

describe("findSharedImports", () => {
  it("finds shared specifiers in from / side-effect / dynamic positions (sorted)", () => {
    const src = [
      `import { z } from "document-model";`,
      `import "@powerhousedao/design-system/connect";`,
      `const m = await import("@powerhousedao/shared/registry/urls");`,
      `export * from "@powerhousedao/reactor-browser/rpc";`,
    ].join("\n");
    expect(findSharedImports(src)).toEqual([
      "@powerhousedao/design-system/connect",
      "@powerhousedao/reactor-browser/rpc",
      "@powerhousedao/shared/registry/urls",
      "document-model",
    ]);
  });

  it("reports subpaths of a shared root (the package's exports, not the list)", () => {
    const src = `import { a } from "@powerhousedao/shared/connect";`;
    expect(findSharedImports(src)).toEqual(["@powerhousedao/shared/connect"]);
  });

  it("ignores plain string literals and non-shared packages", () => {
    const src = [
      `const s = "document-model";`, // string literal, not an import position
      `import { x } from "unrelated-pkg";`, // not shared
    ].join("\n");
    expect(findSharedImports(src)).toEqual([]);
  });

  it("accepts a restricted specs argument", () => {
    const src = `import { x } from "document-model"; import { y } from "zod";`;
    expect(findSharedImports(src, ["zod"])).toEqual(["zod"]);
  });
});

describe("rewritePackageSource", () => {
  const cdn = "https://cdn.example.com/pkg@1.0.0/dist/browser/index.js";
  const imports = {
    "document-model": "https://app.example.com/__vendor__/document-model.js",
  };

  it("rewrites shared specifiers to their mapped URLs", () => {
    const src = `import { z } from "document-model";`;
    expect(rewritePackageSource(src, cdn, imports)).toBe(
      `import { z } from "https://app.example.com/__vendor__/document-model.js";`,
    );
  });

  it("makes ./ and ../ specifiers absolute; leaves # subpath imports alone", () => {
    const src = `import { a } from "./chunk-a.js"; import { b } from "../lib/b.js"; import { c } from "#utils";`;
    const out = rewritePackageSource(src, cdn, imports);
    expect(out).toBe(
      `import { a } from "https://cdn.example.com/pkg@1.0.0/dist/browser/chunk-a.js"; import { b } from "https://cdn.example.com/pkg@1.0.0/dist/lib/b.js"; import { c } from "#utils";`,
    );
  });

  it("leaves non-shared bare specifiers untouched", () => {
    const src = `import { x } from "unrelated-pkg";`;
    expect(rewritePackageSource(src, cdn, imports)).toBe(src);
  });

  it("returns the input unchanged (value-equal) when nothing matched", () => {
    const src = `import { x } from "unrelated-pkg";`;
    expect(rewritePackageSource(src, cdn, imports)).toEqual(src);
  });

  it("returns the input unchanged for an empty import map", () => {
    const src = `import { x } from "document-model";`;
    expect(rewritePackageSource(src, cdn, {})).toEqual(src);
  });
});

describe("checkSharedDeps", () => {
  const host = {
    "document-model": "6.2.3-dev.8",
    zod: "4.0.0",
  };

  it("satisfies prerelease versions with includePrerelease (monorepo dev versions)", () => {
    expect(
      checkSharedDeps({ dependencies: { "document-model": "^6.2.0" } }, host),
    ).toEqual([]);
  });

  it("mismatches when the range excludes the provided version", () => {
    expect(
      checkSharedDeps({ dependencies: { "document-model": "^6.3.0" } }, host),
    ).toEqual([
      {
        package: "document-model",
        required: "^6.3.0",
        provided: "6.2.3-dev.8",
      },
    ]);
  });

  it("never mismatches on * or protocol ranges", () => {
    expect(
      checkSharedDeps(
        {
          dependencies: {
            "document-model": "*",
            zod: "workspace:*",
            "document-engineering": "npm:@powerhousedao/document-engineering@1.0.0",
            "document-model-x": "file:../local",
          },
        },
        host,
      ),
    ).toEqual([]);
  });

  it("skips deps absent from the host version table and non-string ranges", () => {
    expect(
      checkSharedDeps(
        {
          dependencies: { "not-hosted": "^1.0.0" },
          peerDependencies: { "document-model": { not: "a-string" } } as never,
        },
        host,
      ),
    ).toEqual([]);
  });

  it("checks peerDependencies like dependencies", () => {
    expect(
      checkSharedDeps({ peerDependencies: { zod: "^3.0.0" } }, host),
    ).toEqual([{ package: "zod", required: "^3.0.0", provided: "4.0.0" }]);
  });

  it("ignores invalid range strings instead of throwing", () => {
    expect(
      checkSharedDeps({ dependencies: { "document-model": "not a range" } }, host),
    ).toEqual([]);
  });
});

describe("formatSharedDepWarnings", () => {
  it("produces one readable line per mismatch", () => {
    expect(
      formatSharedDepWarnings([
        { package: "document-model", required: "^6.3.0", provided: "6.2.3-dev.8" },
      ]),
    ).toEqual([
      "document-model: requires ^6.3.0, Connect provides 6.2.3-dev.8",
    ]);
  });
});

describe("SHARED_DEP_SPECIFIERS", () => {
  it("covers the documented shared set", () => {
    expect(SHARED_DEP_SPECIFIERS).toContain("document-model");
    expect(SHARED_DEP_SPECIFIERS).toContain("@powerhousedao/reactor-browser");
    expect(SHARED_DEP_SPECIFIERS).toContain("@powerhousedao/shared/registry/urls");
    expect(SHARED_DEP_SPECIFIERS).not.toContain("@powerhousedao/connect");
    expect(SHARED_DEP_SPECIFIERS).toHaveLength(6);
  });
});
