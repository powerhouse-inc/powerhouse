import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "index.ts",
    "document-models/index.ts",
    "document-models/*/index.ts",
    "editors/index.ts",
    "editors/*/index.ts",
    "processors/index.ts",
    "subgraphs/index.ts",
    "manifest.ts",
  ],
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  copy: [{ from: "powerhouse.manifest.json", to: "dist" }],
});
