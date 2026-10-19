import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

// Neutral: both a Connect tab and a Node host consume the router.
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
