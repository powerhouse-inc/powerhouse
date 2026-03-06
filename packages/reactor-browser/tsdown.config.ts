import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  outDir: "dist/src",
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
});
