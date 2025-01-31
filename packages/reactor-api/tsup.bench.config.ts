import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["test/benchmark/**/*.ts"],
  outDir: "dist/benchmark",
  format: ["cjs", "esm"],
  splitting: false,
  sourcemap: true,
  clean: false,
  bundle: true,
  platform: "node",
  target: "node20",
});
