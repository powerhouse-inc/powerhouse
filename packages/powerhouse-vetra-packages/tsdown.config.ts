import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "index.ts",
    "document-models/index.ts",
    "document-models/*/index.ts",
    "editors/index.ts",
    "editors/*/index.ts",
  ],
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  external: [/^[^./]/],
});
