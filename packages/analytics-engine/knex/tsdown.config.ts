import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.ts"],
  outDir: "dist",
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
});
