import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig([
  {
    entry: {
      index: "./src/index.ts",
      testing: "./src/testing.ts",
    },
    platform: "node",
    outDir: "dist",
    outExtensions: () => ({ js: ".js" }),
    clean: true,
    dts: { generator: "tsgo" },
    plugins: [dtsExportList()],
    sourcemap: true,
  },
  // `worker-entry` must land at dist/worker-entry.js: the fork transport finds
  // it by walking up to the nearest package.json.
  {
    entry: { "worker-entry": "./src/worker/entry.ts" },
    platform: "node",
    outDir: "dist",
    outExtensions: () => ({ js: ".js" }),
    clean: true,
    dts: false,
    sourcemap: true,
    // Every forked child loads this: one file, with zod's unused locales dropped.
    deps: { alwaysBundle: [/^@powerhousedao\/pieces-framework/, /^zod/] },
  },
]);
