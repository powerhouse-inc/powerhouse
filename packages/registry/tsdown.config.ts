import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/cli.ts",
  outDir: "dist",
  clean: true,
  dts: { build: true },
  sourcemap: true,
});
