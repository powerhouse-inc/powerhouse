import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["src/index.ts", "src/helpers/*.ts", "src/types/index.ts"],
  outDir: "dist",
  platform: "node",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
