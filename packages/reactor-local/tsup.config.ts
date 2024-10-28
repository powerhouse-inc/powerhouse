import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: false,
  sourcemap: false,
  clean: true,
  format: "cjs",
  treeshake: true,
  bundle: true,
  platform: "node",
  target: "node22",
  legacyOutput: true,
  external: ["document-drive"],
  loader: {
    ".esm.t": "copy",
  },
  dts: {
    entry: {
      server: "src/server.ts",
      cli: "src/cli.ts",
    },
  },
});
