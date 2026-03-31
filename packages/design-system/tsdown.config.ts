import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/connect/index.ts",
    "src/rwa/index.ts",
    "src/ui/index.ts",
    "src/ui/lib/index.ts",
    "src/ui/components/testing.tsx",
  ],
  outDir: "dist",
  platform: "browser",
  clean: false,
  dts: false,
  sourcemap: true,
  copy: [{ from: "assets", to: "dist" }],
});
