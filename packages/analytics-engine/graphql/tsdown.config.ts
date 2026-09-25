import { defineConfig } from "tsdown";
import { dtsExportList } from "../../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["./index.ts"],
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
