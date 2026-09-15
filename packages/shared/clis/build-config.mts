import { esmExternalRequirePlugin } from "rolldown/plugins";
import type { InlineConfig } from "tsdown";
import {
  findSharedImports,
  SHARED_DEP_SPECIFIERS,
} from "../connect/shared-deps.js";

const entry = [
  "index.ts",
  "document-models/index.ts",
  "document-models/*/index.ts",
  "document-models/*/module.ts",
  "editors/index.ts",
  "editors/*/index.ts",
  "editors/*/module.ts",
  "subgraphs/index.ts",
  "subgraphs/*/index.ts",
  "processors/index.ts",
  "processors/*/index.ts",
];

// ./reactor is browser-only: the SharedWorker needs it, the node build does not.
export const browserEntry = [...entry, "reactor/index.ts"];

const alwaysBundle = ["**"];

// React must be external in rolldown (via neverBundle) so ESM `import ... from "react"`
// stays as a bare import and resolves to the host's React at runtime — otherwise
// rolldown bundles react.production.js into a chunk and we get two React instances.
// esmExternalRequirePlugin additionally rewrites any CJS `require("react")` in bundled
// deps to an ESM import so they hit the same external.
const reactExternals = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-dom/client",
];

const nodeNeverBundle = [
  // we know that we don't want connect inside connect
  "@powerhousedao/connect",
  // published code would never need the cli
  "@powerhousedao/ph-cli",
  // the reactor-api host must provide a single class identity for
  // BaseSubgraph/BaseProcessor — inlining a copy here breaks the
  // prototype-chain check the package loader uses to detect subgraphs.
  "@powerhousedao/reactor-api",
  // react is resolved from esm.sh
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-dom/client",
  // build tools
  "tailwindcss",
  "vitest",
  "tsdown",
  "@tailwindcss/cli",
  "@vitejs/plugin-react",
  // testing tools
  "@testing-library/jest-dom",
  "@testing-library/react",
  "@testing-library/user-event",
  // types
  "@types/node",
  "@types/react",
  "@types/react-dom",
  // exclude pglite wasm/data chunks
  "@electric-sql/pglite",
  "@electric-sql/pglite-tools",
];

const copy = [{ from: "powerhouse.manifest.json", to: "dist" }];

const config = false;
const clean = true;
// types are emitted via a separate tsc command
const dts = false;
const sourcemap = true;

// Shared deps are externalized from every package build: the host (Connect)
// resolves them to one bundled copy via the import map, so a package must
// not inline its own copy (two instances of the same dep break identity
// checks and double the download). One regexp per specifier covers the root
// and every subpath (rolldown `external` accepts strings and regexps, not
// function matchers, in this toolchain).
const sharedNeverBundle = SHARED_DEP_SPECIFIERS.map(
  (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.*)?$`),
);

const baseBrowserConfig = {
  entry: browserEntry,
  platform: "browser" as const,
  copy,
  config,
  clean,
  dts,
  sourcemap,
  plugins: [
    esmExternalRequirePlugin({
      external: reactExternals,
      skipDuplicateCheck: true,
    }),
  ],
  inputOptions: {
    experimental: { resolveNewUrlToAsset: true },
  },
};

export type BrowserBuildConfigOptions = {
  /** Externalize the shared dependency set (default: true). */
  sharedDeps?: boolean;
};

export function buildBrowserBuildConfig(
  options: BrowserBuildConfigOptions = {},
): InlineConfig {
  const sharedDeps = options.sharedDeps ?? true;
  return {
    ...baseBrowserConfig,
    deps: {
      alwaysBundle,
      neverBundle: [
        ...nodeNeverBundle,
        ...(sharedDeps ? sharedNeverBundle : []),
      ],
    },
  };
}

// Kept for existing callers: the default (shared deps externalized).
export const browserBuildConfig = buildBrowserBuildConfig();

/**
 * Shared specs a source imports but the built output no longer references as
 * bare imports — the bundler inlined them, which is exactly what the
 * external set is meant to prevent.
 */
export function findBundledSharedDeps(
  importedSpecs: string[],
  outputs: readonly { path: string; content: string }[],
): string[] {
  return importedSpecs.filter(
    (spec) =>
      !outputs.some((f) => findSharedImports(f.content, [spec]).includes(spec)),
  );
}

export const nodeBuildConfig: InlineConfig = {
  entry,
  deps: {
    alwaysBundle,
    neverBundle: nodeNeverBundle,
  },
  platform: "node",
  config,
  clean,
  dts,
  sourcemap,
};
