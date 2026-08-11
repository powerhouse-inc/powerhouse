import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["index.ts", "document-models/index.ts", "document-models/*/index.ts"],
  platform: "neutral",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
