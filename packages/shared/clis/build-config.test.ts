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
  findBundledSharedDeps,
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

  it("keeps the react string externals in the default config", () => {
    const neverBundle = buildBrowserBuildConfig().deps!.neverBundle as string[];
    for (const spec of [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
    ]) {
      expect(neverBundle).toContain(spec);
    }
  });

  it("sharedDeps: false omits the shared regexps but keeps the rest", () => {
    const cfg = buildBrowserBuildConfig({ sharedDeps: false });
    const neverBundle = cfg.deps!.neverBundle as (string | RegExp)[];
    expect(neverBundle.some((e) => e instanceof RegExp)).toBe(false);
    expect(neverBundle).toContain("react");
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
    ).toBe(true);
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
