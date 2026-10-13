import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["src/index.ts", "src/runner.ts"],
  outDir: "dist",
  // runs in the Node CLI context (ph run desktop …)
  platform: "node",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
