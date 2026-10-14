import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/runners/clint-runner.ts",
    "src/runners/mastra-runner.ts",
  ],
  outDir: "dist",
  // clint runs in the Node CLI context (ph run / generated CLIs).
  platform: "node",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
