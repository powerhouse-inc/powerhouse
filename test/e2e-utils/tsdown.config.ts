import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/helpers/*.ts", "src/types/index.ts"],
  outDir: "dist",
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
});
