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

const browserNeverBundle = [
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
];

const nodeNeverBundle = [...browserNeverBundle, "@powerhousedao/reactor-api"];

const copy = [{ from: "powerhouse.manifest.json", to: "dist" }];

const config = false;
const clean = true;
const dts = true;
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
