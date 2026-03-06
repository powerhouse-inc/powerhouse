import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.mts"],
  outDir: "dist",
  clean: true,
  dts: { build: true },
  sourcemap: true,
  unbundle: true,
});
