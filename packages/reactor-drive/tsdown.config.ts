import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  // The subgraph is its own entry: importing the package mustn't parse its schema.
  entry: { index: "./index.ts", subgraph: "./src/subgraph/index.ts" },
  platform: "node",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
