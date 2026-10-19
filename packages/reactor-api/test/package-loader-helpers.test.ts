/**
 * Unit tests for the small helpers underpinning HTTP-registry package loading:
 *
 *   - `extractSubgraphsFromModule` — pulls subgraph classes out of the
 *     `subgraphs/index.mjs` namespace shape, which varies depending on how
 *     the source file's exports are named.
 *   - `isExpectedLoaderMiss` — classifies a loader exception as either an
 *     "expected fallthrough" (suppress) or a real error (warn).
 *
 * Both are exercised against synthetic inputs that mirror real-world shapes,
 * since wiring up an actual HTTP-loaded bundle just for two pure helpers
 * would be disproportionate.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import { extractSubgraphsFromModule } from "../src/packages/http-loader.js";
import { isExpectedLoaderMiss } from "../src/packages/package-manager.js";
import { manifestDeclaredSubgraphs } from "../src/packages/util.js";

// Real subclasses: the unified extraction rule accepts a value only when it
// passes `isSubgraphClass`, so a bare `class Foo {}` is junk by design.
// The full accept/reject table for the shared rule lives in
// subgraph-module-contract.test.ts; this file keeps the http-loader's
// module-shape cases.
class Foo extends BaseSubgraph {}
class Bar extends BaseSubgraph {}

describe("extractSubgraphsFromModule", () => {
  it("extracts classes when the inner key matches the outer alias", () => {
    // Shape produced when the source file's class name equals the alias used
    // in `export * as Foo from "./file"` — common case in current op-hub.
    const module = {
      FooSubgraph: { FooSubgraph: Foo },
      BarSubgraph: { BarSubgraph: Bar },
    } as unknown as Record<string, Record<string, SubgraphClass>>;

    const subgraphs = extractSubgraphsFromModule(module);

    expect(subgraphs).toHaveLength(2);
    expect(subgraphs).toContain(Foo as unknown as SubgraphClass);
    expect(subgraphs).toContain(Bar as unknown as SubgraphClass);
  });

  it("extracts classes when the inner key is `Subgraph` / `default`, once each", () => {
    // Shape produced by older bundles where the source file exports the class
    // under a generic name like `Subgraph` or `default`. The buggy
    // `value[outerKey]` lookup silently returned [] for this shape. The
    // unified rule also dedupes: one class reached through two keys
    // registers once, not twice.
    const module = {
      FooSubgraph: { Subgraph: Foo, default: Foo },
      BarSubgraph: { Subgraph: Bar, default: Bar },
    } as unknown as Record<string, Record<string, SubgraphClass>>;

    const subgraphs = extractSubgraphsFromModule(module);

    expect(subgraphs).toHaveLength(2);
    expect(subgraphs).toContain(Foo as unknown as SubgraphClass);
    expect(subgraphs).toContain(Bar as unknown as SubgraphClass);
  });

  it("filters out non-subgraph namespace members", () => {
    // export * also includes type-only re-exports, constants, helper
    // functions, unrelated classes. None of them is a subgraph. The helper
    // function and the unrelated class used to pass (any callable did).
    const module = {
      FooSubgraph: {
        FooSubgraph: Foo,
        FOO_VERSION: "1.0.0" as unknown as SubgraphClass,
        FOO_CONFIG: { x: 1 } as unknown as SubgraphClass,
        helper: (() => 1) as unknown as SubgraphClass,
        Unrelated: class {} as unknown as SubgraphClass,
      },
    } as unknown as Record<string, Record<string, SubgraphClass>>;

    const subgraphs = extractSubgraphsFromModule(module);

    expect(subgraphs).toEqual([Foo]);
  });

  it("returns [] for an empty module", () => {
    expect(extractSubgraphsFromModule({})).toEqual([]);
  });
});

describe("isExpectedLoaderMiss", () => {
  const pkg = "@powerhousedao/op-hub";

  function moduleNotFound(message: string): Error {
    const err = new Error(message) as NodeJS.ErrnoException;
    err.code = "ERR_MODULE_NOT_FOUND";
    return err;
  }

  it("treats ERR_MODULE_NOT_FOUND matching the requested package as expected", () => {
    const err = moduleNotFound(`Cannot find package '${pkg}' imported from /x`);
    expect(isExpectedLoaderMiss(err, pkg)).toBe(true);
  });

  it("matches subpath imports of the requested package", () => {
    // Loaders call `import("${pkg}/subgraphs")`; the error name retains the subpath.
    const err = moduleNotFound(
      `Cannot find module '${pkg}/subgraphs' imported from /x`,
    );
    expect(isExpectedLoaderMiss(err, pkg)).toBe(true);
  });

  it("matches double-quoted error messages", () => {
    const err = moduleNotFound(`Cannot find package "${pkg}" imported from /x`);
    expect(isExpectedLoaderMiss(err, pkg)).toBe(true);
  });

  it("does NOT treat transitive resolution failures as expected", () => {
    // A bundle for `pkg` loaded successfully, but its bare `import "react"`
    // didn't resolve. That's a real bundle-side bug, not a loader miss.
    const err = moduleNotFound(
      `Cannot find package 'react' imported from /path/to/bundle.mjs`,
    );
    expect(isExpectedLoaderMiss(err, pkg)).toBe(false);
  });

  it("treats ERR_UNSUPPORTED_DIR_IMPORT as expected (empty subgraphs/ dir)", () => {
    const err = new Error(
      "Directory import '/foo/subgraphs' is not supported",
    ) as NodeJS.ErrnoException;
    err.code = "ERR_UNSUPPORTED_DIR_IMPORT";
    expect(isExpectedLoaderMiss(err, pkg)).toBe(true);
  });

  it("treats a subpath an `exports` map omits as expected", () => {
    // A package that ships no document models says so by not exporting the
    // subpath; the loader asking for it is not a failure to load anything.
    const err = new Error(
      `Package subpath './document-models' is not defined by "exports" in /x/${pkg}/package.json imported from /y/loader.mjs`,
    ) as NodeJS.ErrnoException;
    err.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
    expect(isExpectedLoaderMiss(err, pkg, "document-models")).toBe(true);
    // A different subpath in the same shape is a real resolution failure.
    expect(isExpectedLoaderMiss(err, pkg, "subgraphs")).toBe(false);
  });

  it("treats a package that exports no ./pieces as expected", () => {
    // Nearly every package ships none, and each would otherwise log a loader
    // failure the moment pieces became a fourth kind.
    const err = new Error(
      `Package subpath './pieces' is not defined by "exports" in /x/${pkg}/package.json imported from /y/loader.mjs`,
    ) as NodeJS.ErrnoException;
    err.code = "ERR_PACKAGE_PATH_NOT_EXPORTED";
    expect(isExpectedLoaderMiss(err, pkg, "pieces")).toBe(true);
  });

  it("treats a 404 for the asked-for subpath as expected, and 500 as real", () => {
    const missing = new Error(
      "Failed to fetch http://localhost:8080/-/cdn/pkg/node/processors/index.mjs: 404",
    );
    expect(isExpectedLoaderMiss(missing, pkg, "processors")).toBe(true);

    const broken = new Error(
      "Failed to fetch http://localhost:8080/-/cdn/pkg/node/processors/index.mjs: 503",
    );
    expect(isExpectedLoaderMiss(broken, pkg, "processors")).toBe(false);
  });

  it("does NOT treat a 404 for something else the bundle imports as expected", () => {
    const err = new Error(
      "Failed to fetch http://localhost:8080/-/cdn/other/node/document-models/index.mjs: 404",
    );
    expect(isExpectedLoaderMiss(err, pkg, "processors")).toBe(false);
  });

  it("treats HttpPackageLoader's 'Invalid package name:' as expected", () => {
    const err = new Error("Invalid package name: /Users/foo/test-hub");
    expect(isExpectedLoaderMiss(err, pkg)).toBe(true);
  });

  it("treats unrelated errors as unexpected (real failures)", () => {
    expect(isExpectedLoaderMiss(new TypeError("boom"), pkg)).toBe(false);
    expect(
      isExpectedLoaderMiss(new Error("Bundle evaluation crashed"), pkg),
    ).toBe(false);
  });

  it("treats non-Error throws as unexpected", () => {
    expect(isExpectedLoaderMiss("string thrown", pkg)).toBe(false);
    expect(isExpectedLoaderMiss(null, pkg)).toBe(false);
    expect(isExpectedLoaderMiss(undefined, pkg)).toBe(false);
  });
});

// Backs the package manager's zero-subgraphs warning: when a package's own
// manifest promises subgraphs and the loaders deliver none, that mismatch is
// the one detectable trace of a broken subgraphs/index.ts (loadSubgraphs
// itself "cannot throw"). The helper answers what the manifest declares.
describe("manifestDeclaredSubgraphs", () => {
  const temporary: string[] = [];

  afterEach(() => {
    for (const dir of temporary.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makePackageDir(manifest?: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "ph-manifest-subgraphs-"));
    temporary.push(dir);
    if (manifest !== undefined) {
      writeFileSync(
        join(dir, "powerhouse.manifest.json"),
        typeof manifest === "string" ? manifest : JSON.stringify(manifest),
      );
    }
    return dir;
  }

  it("lists the declared subgraph ids for an absolute package path", () => {
    const dir = makePackageDir({
      name: "@acme/pkg",
      subgraphs: [
        { name: "Statements", id: "statements" },
        { name: "Transaction Ledger", id: "transaction-ledger" },
      ],
    });
    expect(manifestDeclaredSubgraphs(dir)).toEqual([
      "statements",
      "transaction-ledger",
    ]);
  });

  it("answers [] when the manifest declares none", () => {
    expect(manifestDeclaredSubgraphs(makePackageDir({ name: "x" }))).toEqual(
      [],
    );
    expect(
      manifestDeclaredSubgraphs(makePackageDir({ subgraphs: [] })),
    ).toEqual([]);
  });

  it("answers [] without a manifest, and for malformed entries", () => {
    expect(manifestDeclaredSubgraphs(makePackageDir())).toEqual([]);
    expect(manifestDeclaredSubgraphs(makePackageDir("not json"))).toEqual([]);
    expect(
      manifestDeclaredSubgraphs(
        makePackageDir({ subgraphs: [null, 42, {}, { id: "" }] }),
      ),
    ).toEqual([]);
  });

  it("answers [] for a bare package name (manifest not reachable)", () => {
    expect(manifestDeclaredSubgraphs("@acme/published-pkg")).toEqual([]);
  });
});
