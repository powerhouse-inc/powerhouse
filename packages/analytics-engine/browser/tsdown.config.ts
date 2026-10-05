import { defineConfig } from "tsdown";
import { dtsExportList } from "../../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["./index.ts", "./test-utils.ts"],
  outDir: "dist",
  platform: "browser",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
