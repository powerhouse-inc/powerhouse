import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts"],
  outDir: "dist",
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
});
