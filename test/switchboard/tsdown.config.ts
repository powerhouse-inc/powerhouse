import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/**/*.ts"],
  outDir: "dist",
  platform: "node",
  clean: true,
  dts: false,
  sourcemap: true,
});
