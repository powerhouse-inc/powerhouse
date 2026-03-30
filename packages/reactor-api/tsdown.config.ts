import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts"],
  platform: "node",
  outDir: "dist",
  clean: false,
  dts: false,
  sourcemap: true,
  loader: { ".graphql": "text" },
  external: [/^[^./]/],
});
