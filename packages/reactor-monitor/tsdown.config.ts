import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/react/index.ts",
    "src/worker/reactor-monitor.worker.ts",
  ],
  outDir: "dist",
  platform: "browser",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
