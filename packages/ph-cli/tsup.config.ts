import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: "esm",
  treeshake: true,
  bundle: false,
  platform: "node",
  target: "node20",
  cjsInterop: true,
  dts: true,
});
