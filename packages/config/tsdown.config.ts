import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  outDir: "dist",
  platform: "neutral",
  deps: {
    neverBundle: [/^node:/],
  },
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
