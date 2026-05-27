import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./index.ts",
    entry: "./src/executor/worker/entry.ts",
    "projection-entry":
      "./src/projection/projection-worker/projection-entry.ts",
  },
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
