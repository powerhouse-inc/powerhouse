import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts"],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  loader: { ".graphql": "text" },
});
