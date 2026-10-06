import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: {
    index: "./index.ts",
    rpc: "./src/rpc/index.ts",
    entry: "./src/executor/worker/entry.ts",
    "projection-entry":
      "./src/projection/projection-worker/projection-entry.ts",
  },
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
