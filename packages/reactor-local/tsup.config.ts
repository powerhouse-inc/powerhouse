import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: true,
  sourcemap: false,
  clean: true,
  format: "esm",
  treeshake: true,
  bundle: true,
  platform: "node",
  target: "node22",
  noExternal: ["document-drive"],
  shims: true,
  dts: {
    entry: {
      server: "src/server.ts",
      cli: "src/cli.ts",
    },
  },
});
