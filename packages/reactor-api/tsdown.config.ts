import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "index.mts",
    "src/packages/vite-loader.mts",
    "src/packages/https-hooks.mts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  loader: { ".graphql": "text" },
  deps: {
    onlyAllowBundle: [],
  },
});
