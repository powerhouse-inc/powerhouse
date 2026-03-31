import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts", "drive-analytics.ts", "utils/index.ts"],
  outDir: "dist",
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
});
