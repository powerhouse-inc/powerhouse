import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/connect/index.ts",
    "src/rwa/index.ts",
    "src/ui/index.ts",
    "src/ui/lib/index.ts",
    "src/ui/components/testing.tsx",
    "src/ui/components/**/!(*.test|*.stories).tsx",
    "src/ui/components/**/!(*.test|*.stories).ts",
  ],
  outDir: "dist",
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
  copy: [{ from: "assets", to: "dist" }],
});
