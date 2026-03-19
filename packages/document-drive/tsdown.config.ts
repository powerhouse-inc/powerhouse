import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "index.ts",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
