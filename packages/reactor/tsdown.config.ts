import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./index.ts",
    entry: "./src/executor/worker/entry.ts",
  },
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
