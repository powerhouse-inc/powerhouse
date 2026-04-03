import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./cli.ts", "./src/index.ts"],
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
});
