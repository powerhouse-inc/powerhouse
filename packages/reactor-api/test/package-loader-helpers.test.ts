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

import { describe, expect, it } from "vitest";
import type { SubgraphClass } from "../src/graphql/types.js";
import { extractSubgraphsFromModule } from "../src/packages/http-loader.js";
import { isExpectedLoaderMiss } from "../src/packages/package-manager.js";

class Foo {}
class Bar {}

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

  it("extracts classes when the inner key is `Subgraph` / `default`", () => {
    // Shape produced by older bundles where the source file exports the class
    // under a generic name like `Subgraph` or `default`. The buggy
    // `value[outerKey]` lookup silently returned [] for this shape.
    const module = {
      FooSubgraph: { Subgraph: Foo, default: Foo },
      BarSubgraph: { Subgraph: Bar, default: Bar },
    } as unknown as Record<string, Record<string, SubgraphClass>>;

    const subgraphs = extractSubgraphsFromModule(module);

    // Each namespace contributes two entries (Subgraph + default), both Foo/Bar.
    expect(subgraphs).toHaveLength(4);
    expect(subgraphs.filter((s) => s === (Foo as unknown))).toHaveLength(2);
    expect(subgraphs.filter((s) => s === (Bar as unknown))).toHaveLength(2);
  });

  it("filters out non-callable namespace members", () => {
    // export * also includes type-only re-exports, constants, etc. Anything
    // that isn't `typeof === "function"` should be dropped.
    const module = {
      FooSubgraph: {
        FooSubgraph: Foo,
        FOO_VERSION: "1.0.0" as unknown as SubgraphClass,
        FOO_CONFIG: { x: 1 } as unknown as SubgraphClass,
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
