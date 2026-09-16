import { defineConfig } from "tsdown";

// No minify: the piece loader duck-types on `constructor.name === "Piece"`.
export default defineConfig({
  entry: { index: "./src/index.ts", common: "./src/common.ts" },
  platform: "node",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  clean: true,
  dts: true,
  sourcemap: true,
  minify: false,
});
