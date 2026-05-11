import { babel } from "@rollup/plugin-babel";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/connect/index.ts",
    "src/connect/components/toast/toast.tsx",
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
  plugins: [
    babel({
      babelHelpers: "bundled",
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      presets: [
        ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
      ],
      plugins: ["@babel/plugin-transform-react-pure-annotations"],
    }),
  ],
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
