import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  splitting: true,
  sourcemap: true,
  clean: true,
  format: "esm",
  treeshake: true,
  target: "node20",
  dts: true,
});
