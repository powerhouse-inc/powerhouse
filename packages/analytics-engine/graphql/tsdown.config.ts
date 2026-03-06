import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.ts"],
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
