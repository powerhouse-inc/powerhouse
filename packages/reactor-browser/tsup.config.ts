import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: true,
  sourcemap: false,
  clean: true,
  format: ["esm", "cjs"],
  treeshake: true,
  bundle: true,
  platform: "node",
  target: "node20",
  noExternal: ["document-drive"],
  shims: true,
  cjsInterop: true,
  dts: true,
});
