// Tests for the `buildBrowserBuildConfig` factory: the shared dependency set
// is externalized by default (one regexp per shared specifier in
// `neverBundle`, covering root + subpaths), opt-out via `sharedDeps: false`,
// and `findBundledSharedDeps` flags specs the output no longer references as
// bare imports.

import type { InlineConfig } from "tsdown";
import { describe, expect, it } from "vitest";
import {
  browserBuildConfig,
  buildBrowserBuildConfig,
  browserEntry,
  buildNodeBuildConfig,
  buildPieceBuildConfig,
  findBundledSharedDeps,
  nodeBuildConfig,
  PIECE_ENTRY_GLOB,
} from "./build-config.mts";

function sharedMatchers(cfg: InlineConfig): RegExp[] {
  const neverBundle = cfg.deps!.neverBundle as (string | RegExp)[];
  return neverBundle.filter((e): e is RegExp => e instanceof RegExp);
}

describe("buildBrowserBuildConfig", () => {
  it("default externalizes the shared dep set via neverBundle regexps", () => {
    const regexps = sharedMatchers(buildBrowserBuildConfig());
    expect(regexps.length).toBeGreaterThan(0);
    const matches = (id: string) => regexps.some((r) => r.test(id));
    expect(matches("document-model")).toBe(true);
    expect(matches("@powerhousedao/reactor-browser/rpc")).toBe(true);
    expect(matches("@powerhousedao/shared/registry/urls")).toBe(true);
    expect(matches("react")).toBe(false);
    expect(matches("@powerhousedao/connect/utils")).toBe(false);
    // the regexp is anchored: a longer specifier sharing the prefix is not
    // matched
    expect(matches("@powerhousedao/sharedxyz")).toBe(false);
  });

  // The vendor publishes no import-map entry for the bare `@powerhousedao/shared`
  // root or for subpaths outside SHARED_SUBPATHS. Externalizing those would
  // leave a bare specifier in the built package that nothing resolves, so the
  // package fails to load in Connect instead of just bundling its own copy.
  it("does not externalize the bare @powerhousedao/shared root", () => {
    const regexps = sharedMatchers(buildBrowserBuildConfig());
    const matches = (id: string) => regexps.some((r) => r.test(id));
    expect(matches("@powerhousedao/shared")).toBe(false);
  });

  it("does not externalize unvendored @powerhousedao/shared subpaths", () => {
    const regexps = sharedMatchers(buildBrowserBuildConfig());
    const matches = (id: string) => regexps.some((r) => r.test(id));
    expect(matches("@powerhousedao/shared/analytics")).toBe(false);
    expect(matches("@powerhousedao/shared/constants")).toBe(false);
    expect(matches("@powerhousedao/shared/clis")).toBe(false);
  });

  it("still externalizes the vendored @powerhousedao/shared subpaths", () => {
    const regexps = sharedMatchers(buildBrowserBuildConfig());
    const matches = (id: string) => regexps.some((r) => r.test(id));
    expect(matches("@powerhousedao/shared/connect")).toBe(true);
    expect(matches("@powerhousedao/shared/document-model")).toBe(true);
    expect(matches("@powerhousedao/shared/registry/manifest-slim")).toBe(true);
  });

  it("hands the react externals to the require-rewrite plugin, not to neverBundle", () => {
    const config = buildBrowserBuildConfig();
    const neverBundle = config.deps!.neverBundle as (string | RegExp)[];
    const names = (config.plugins as { name: string }[]).map((p) => p.name);
    expect(names).toContain("builtin:esm-external-require");
    for (const spec of [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
    ]) {
      expect(neverBundle).not.toContain(spec);
    }
  });

  it("sharedDeps: false omits the shared regexps but keeps the rest", () => {
    const cfg = buildBrowserBuildConfig({ sharedDeps: false });
    const neverBundle = cfg.deps!.neverBundle as (string | RegExp)[];
    expect(neverBundle.some((e) => e instanceof RegExp)).toBe(false);
    expect(neverBundle).toContain("@powerhousedao/connect");
    expect(neverBundle).not.toContain("react");
    expect(cfg.deps!.alwaysBundle).toEqual(["**"]);
    expect(cfg.entry).toEqual(browserEntry);
    expect(cfg.platform).toBe("browser");
    expect(cfg.clean).toBe(true);
    expect(cfg.dts).toBe(false);
    expect(cfg.sourcemap).toBe(true);
    const experimental = (
      cfg.inputOptions as
        | { experimental?: { resolveNewUrlToAsset?: boolean } }
        | undefined
    )?.experimental;
    expect(experimental?.resolveNewUrlToAsset).toBe(true);
  });

  it("the exported default matches the factory default's shape", () => {
    expect(sharedMatchers(browserBuildConfig).length).toBeGreaterThan(0);
    expect(browserBuildConfig.entry).toEqual(browserEntry);
    expect(
      (browserBuildConfig.deps!.neverBundle as string[]).includes("react"),
    ).toBe(false);
  });
});

// The browser build externalizes the shared set onto Connect's import map.
// The node build had no equivalent and inlined its own copy of every one of
// them, which is the same duplication for the same reason the identity
// comment on `@powerhousedao/reactor-api` already gives: the host provides
// these, and two copies are two class identities. They are declared for the
// consumer to provide -- document-model, @powerhousedao/reactor-browser and
// zod are peerDependencies of every generated project.
describe("buildNodeBuildConfig", () => {
  it("externalizes the shared dep set, as the browser build does", () => {
    const regexps = sharedMatchers(buildNodeBuildConfig());
    expect(regexps.length).toBeGreaterThan(0);
    const matches = (id: string) => regexps.some((r) => r.test(id));
    expect(matches("document-model")).toBe(true);
    expect(matches("@powerhousedao/reactor-browser/rpc")).toBe(true);
    expect(matches("@powerhousedao/shared/registry/urls")).toBe(true);
    // Same narrowing as the browser: nothing the host does not provide.
    expect(matches("@powerhousedao/shared")).toBe(false);
    expect(matches("@powerhousedao/shared/clis")).toBe(false);
  });

  it("keeps the node build's own entries, platform and string externals", () => {
    const cfg = buildNodeBuildConfig();
    expect(cfg.platform).toBe("node");
    // ./pieces is node-only and must stay in the node entry set.
    expect(cfg.entry).toContain("pieces/index.ts");
    expect(cfg.entry).not.toContain("reactor/index.ts");
    // Each piece is its own build, so the list is the only piece entry here.
    expect(cfg.entry).not.toContain(PIECE_ENTRY_GLOB);
    const neverBundle = cfg.deps!.neverBundle as (string | RegExp)[];
    expect(neverBundle).toContain("@powerhousedao/reactor-api");
    expect(neverBundle).toContain("react");
  });

  it("sharedDeps: false omits the shared regexps but keeps the rest", () => {
    const cfg = buildNodeBuildConfig({ sharedDeps: false });
    const neverBundle = cfg.deps!.neverBundle as (string | RegExp)[];
    expect(neverBundle.some((e) => e instanceof RegExp)).toBe(false);
    expect(neverBundle).toContain("@powerhousedao/reactor-api");
  });

  it("the exported default externalizes the shared set", () => {
    expect(sharedMatchers(nodeBuildConfig).length).toBeGreaterThan(0);
  });
});

// zod is already vendored by Connect (it is in DEFAULT_VENDOR_INCLUDE, so the
// import map publishes an entry) and already a peerDependency of every
// generated project -- but it was not in the shared set, so every package
// inlined its own copy of it in both builds. It is the biggest single
// dependency left in a minimal package.
describe("zod", () => {
  it("is externalized from the browser build", () => {
    const regexps = sharedMatchers(buildBrowserBuildConfig());
    expect(regexps.some((r) => r.test("zod"))).toBe(true);
  });

  it("is externalized from the node build", () => {
    const regexps = sharedMatchers(buildNodeBuildConfig());
    expect(regexps.some((r) => r.test("zod"))).toBe(true);
  });

  it("matches zod subpaths but not a package merely starting with zod", () => {
    const regexps = sharedMatchers(buildBrowserBuildConfig());
    const matches = (id: string) => regexps.some((r) => r.test(id));
    expect(matches("zod/v4")).toBe(true);
    expect(matches("zod-validation-error")).toBe(false);
  });
});

describe("findBundledSharedDeps", () => {
  it("does not report a spec the output still imports as a bare import", () => {
    const outputs = [
      {
        path: "index.js",
        content: 'import { subgraph } from "document-model";',
      },
    ];
    expect(findBundledSharedDeps(["document-model"], outputs)).toEqual([]);
  });

  it("reports a spec whose import vanished from the output (inlined)", () => {
    const outputs = [{ path: "index.js", content: "const a = 1;" }];
    expect(findBundledSharedDeps(["document-model"], outputs)).toEqual([
      "document-model",
    ]);
  });

  it("reports a subpath spec inlined across multiple output files", () => {
    const outputs = [
      { path: "index.js", content: "export {};" },
      { path: "chunks/0.js", content: 'import "zod";' },
    ];
    expect(
      findBundledSharedDeps(["@powerhousedao/reactor-browser/rpc"], outputs),
    ).toEqual(["@powerhousedao/reactor-browser/rpc"]);
  });

  it("reports nothing when no shared deps were imported", () => {
    expect(
      findBundledSharedDeps([], [{ path: "index.js", content: "export {};" }]),
    ).toEqual([]);
  });
});

describe("buildPieceBuildConfig", () => {
  const cfg = buildPieceBuildConfig({
    entry: "pieces/invoices/index.ts",
    outDir: "dist/node/pieces/invoices",
  });

  it("builds one piece into its own directory as a single module", () => {
    expect(cfg.entry).toEqual({ index: "pieces/invoices/index.ts" });
    expect(cfg.outDir).toBe("dist/node/pieces/invoices");
    expect(cfg.platform).toBe("node");
    expect(cfg.outputOptions).toEqual({ codeSplitting: false });
  });

  // A piece runs in a forked worker with no node_modules, so the shared set,
  // the framework and React alike are inlined: nothing is left to the host.
  it("externalizes nothing, and says so without tsdown's bundling hint", () => {
    expect(cfg.deps!.alwaysBundle).toEqual(["**"]);
    expect(cfg.deps!.neverBundle).toEqual([]);
    expect(cfg.deps!.onlyAllowBundle).toBe(false);
  });

  it("does not emit declarations itself (tsc does)", () => {
    expect(cfg.dts).toBe(false);
  });
});
