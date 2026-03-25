import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "index.mts",
    "src/templates/index.mts",
    "src/file-builders/index.mts",
    "src/name-builders/index.mts",
    "src/utils/index.mts",
  ],
  outDir: "dist",
  platform: "node",
});
