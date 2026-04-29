import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    neverBundle: [/^node:/],
  },
});
