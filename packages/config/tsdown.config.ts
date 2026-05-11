import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  outDir: "dist",
  platform: "neutral",
  deps: {
    neverBundle: [/^node:/],
  },
  clean: true,
  dts: true,
  sourcemap: true,
});
