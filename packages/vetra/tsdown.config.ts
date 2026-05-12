import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "index.ts",
    "document-models/index.ts",
    "document-models/*/index.ts",
    "editors/index.ts",
    "editors/*/index.ts",
    "processors/index.ts",
    "processors/*/index.ts",
    "codegen/index.ts",
    "powerhouse.manifest.json",
  ],
  platform: "neutral",
  outDir: "dist",
  deps: {
    neverBundle: [/^node:/],
  },
  clean: true,
  dts: true,
  sourcemap: true,
});
