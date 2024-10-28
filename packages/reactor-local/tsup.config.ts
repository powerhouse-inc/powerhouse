import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: false,
  sourcemap: false,
  clean: true,
  format: "esm",
  treeshake: true,
  bundle: false,
  platform: "node",
  target: "node20",
  legacyOutput: true,
  external: ["document-drive", "document-model"],
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
