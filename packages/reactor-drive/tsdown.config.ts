import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.ts"],
  platform: "node",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  clean: true,
  dts: true,
  sourcemap: true,
});
