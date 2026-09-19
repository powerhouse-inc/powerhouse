import { esmExternalRequirePlugin } from "rolldown/plugins";
import type { InlineConfig } from "tsdown";
import {
  EXTERNALIZABLE_SHARED_SPECIFIERS,
  findSharedImports,
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

// ./pieces is node-only for the same reason ./reactor is browser-only: a piece
// is loaded and run by a host process, never by the browser. Only the list of
// pieces builds here; each piece is its own build (buildPieceBuildConfig), so
// two pieces never share a chunk and each ships as one self-contained module.
const nodeEntry = [...entry, "pieces/index.ts"];

// Where a package's pieces live, one directory per piece, as the node entry
// glob spells it; `ph build` expands it against the project to find them.
export const PIECE_ENTRY_GLOB = "pieces/*/index.ts";

// ./reactor is browser-only: the SharedWorker needs it, the node build does not.
export const browserEntry = [...entry, "reactor/index.ts"];

const alwaysBundle = ["**"];

// React must be external so `import ... from "react"` stays a bare import and
// resolves to the host's React at runtime; bundled, a chunk would carry a second
// React. In the browser build the externals below belong to esmExternalRequirePlugin
// alone: rolldown converts a CommonJS `require("react")` into an import only for
// externals the plugin owns, and listed in neverBundle too the top-level external
// wins, leaving a browser bundle with a require it cannot serve. use-sync-external-store
// under zustand, and so under @xyflow/react, is the case that found this.
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

// The node build keeps React in neverBundle: node has createRequire, so a
// CommonJS require of an external resolves there without the plugin.
const browserNeverBundle = nodeNeverBundle.filter(
  (spec) => typeof spec !== "string" || !reactExternals.includes(spec),
);

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
//
// Only the specifiers the vendor publishes are externalized — see
// EXTERNALIZABLE_SHARED_SPECIFIERS. Externalizing one the import map has no
// entry for would leave an unresolvable bare specifier in the output.
const sharedNeverBundle = EXTERNALIZABLE_SHARED_SPECIFIERS.map(
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
        ...browserNeverBundle,
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

export type NodeBuildConfigOptions = {
  /** Externalize the shared dependency set (default: true). */
  sharedDeps?: boolean;
};

/**
 * The node build externalizes the same shared set as the browser build, for
 * the same reason the `@powerhousedao/reactor-api` entry in `nodeNeverBundle`
 * already gives: the host provides these, and a package carrying its own copy
 * is a second class identity as well as dead weight. What differs is only how
 * the import is resolved at runtime -- Connect's import map in the browser,
 * ordinary node resolution here, which works because these are declared for
 * the consumer to provide (`document-model`, `@powerhousedao/reactor-browser`
 * and `zod` are peerDependencies of every generated project).
 */
export function buildNodeBuildConfig(
  options: NodeBuildConfigOptions = {},
): InlineConfig {
  const sharedDeps = options.sharedDeps ?? true;
  return {
    entry: nodeEntry,
    deps: {
      alwaysBundle,
      neverBundle: [
        ...nodeNeverBundle,
        ...(sharedDeps ? sharedNeverBundle : []),
      ],
    },
    platform: "node",
    config,
    clean,
    dts,
    sourcemap,
  };
}

// Kept for existing callers: the default (shared deps externalized).
export const nodeBuildConfig: InlineConfig = buildNodeBuildConfig();

export type PieceBuildConfigOptions = {
  /** The piece's source entry, relative to the project: `pieces/<dir>/index.ts`. */
  entry: string;
  /** Where the piece lands: `<outDir>/node/pieces/<dir>`. */
  outDir: string;
};

/**
 * One piece, bundled whole. A piece runs in a forked worker with no
 * node_modules beside it, so nothing the piece imports can be left to the
 * host: the framework, its dependencies and the shared set that every other
 * module kind externalizes are all inlined here, and only node built-ins stay
 * external. Code splitting is off for the same reason, so a dynamic import is
 * inlined too and the piece directory holds exactly one module.
 */
export function buildPieceBuildConfig(
  options: PieceBuildConfigOptions,
): InlineConfig {
  return {
    entry: { index: options.entry },
    outDir: options.outDir,
    platform: "node",
    deps: {
      alwaysBundle,
      neverBundle: [],
      // Inlining dependencies is the point here, so tsdown's hint about it
      // would only be noise on every piece.
      onlyAllowBundle: false,
    },
    outputOptions: { codeSplitting: false },
    config,
    clean,
    dts,
    sourcemap,
  };
}
