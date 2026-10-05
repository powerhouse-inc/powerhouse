import { defineConfig } from "tsdown";
import { dtsExportList } from "../../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["./index.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
