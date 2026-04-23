import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/connect/index.ts",
    "src/rwa/index.ts",
    "src/ui/index.ts",
    "src/ui/lib/index.ts",
    "src/ui/**/*.ts",
    "src/ui/**/*.tsx",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/**/*.stories.tsx",
    "!src/**/testing.tsx",
    "!src/**/decorators.tsx",
    "!src/**/storybook-arg-types.tsx",
  ],
  outDir: "dist",
  platform: "browser",
  clean: true,
  dts: true,
  sourcemap: true,
  loader: {
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".gif": "dataurl",
    ".webp": "dataurl",
    ".avif": "dataurl",
    ".svg": "dataurl",
    ".mp4": "dataurl",
  },
});
