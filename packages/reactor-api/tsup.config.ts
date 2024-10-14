import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  splitting: true,
  sourcemap: true,
  clean: true,
  format: "esm",
  treeshake: true,
  noExternal: ["document-drive"],
  target: "node20",

  loader: {
    ".graphql": "file",
  },
  dts: true,
});
