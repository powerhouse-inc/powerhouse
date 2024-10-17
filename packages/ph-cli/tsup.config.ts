import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: "cjs",
  treeshake: true,
  bundle: false,
  platform: "node",
  target: "node20",
  legacyOutput: true,
  loader: {
    ".esm.t": "copy",
  },
  dts: {
    entry: {
      index: "src/index.ts",
      cli: "src/cli.ts",
    },
  },
});
