import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./index.ts",
  outDir: "cdn",
  platform: "neutral",
  sourcemap: false,
});
