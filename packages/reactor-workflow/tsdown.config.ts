import { defineConfig } from "tsdown";

// `worker-entry` must land at dist/worker-entry.js: the fork transport finds it
// by walking up to the nearest package.json.
export default defineConfig({
  entry: {
    index: "./src/index.ts",
    testing: "./src/testing.ts",
    "worker-entry": "./src/pieces/activepieces/worker/entry.ts",
  },
  platform: "node",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  clean: true,
  dts: true,
  sourcemap: true,
});
