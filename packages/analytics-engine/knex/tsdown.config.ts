import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: { build: true },
  sourcemap: true,
  unbundle: true,
});
