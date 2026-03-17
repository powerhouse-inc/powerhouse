import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "analytics/index.ts",
    "connect/index.ts",
    "document-model/index.ts",
    "processors/index.ts",
    "registry/index.ts",
  ],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
});
