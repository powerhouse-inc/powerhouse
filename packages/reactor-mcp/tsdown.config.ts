import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/tools/index.ts"],
  outDir: "dist",
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
});
