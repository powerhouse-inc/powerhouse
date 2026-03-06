import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./index.ts",
  platform: "neutral",
  clean: true,
  dts: { build: true },
  sourcemap: false,
});
