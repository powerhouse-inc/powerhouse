import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: { build: true },
  sourcemap: true,
  unbundle: true,
});
