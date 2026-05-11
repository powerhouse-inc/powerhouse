import { esmExternalRequirePlugin } from "rolldown/plugins";
import type { InlineConfig } from "tsdown";

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

const browserNeverBundle = [...nodeNeverBundle, "@powerhousedao/reactor-api"];

const copy = [{ from: "powerhouse.manifest.json", to: "dist" }];

const config = false;
const clean = true;
// types are emitted via a separate tsc command
const dts = false;
const sourcemap = true;

export const browserBuildConfig: InlineConfig = {
  entry,
  deps: {
    alwaysBundle,
    neverBundle: browserNeverBundle,
  },
  platform: "browser",
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
