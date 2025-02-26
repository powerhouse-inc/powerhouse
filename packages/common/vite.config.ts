import path from "node:path";
import { defineConfig, Plugin } from "vite";
import dts from "vite-plugin-dts";
import generateFile from "vite-plugin-generate-file";
import tsconfigPaths from "vite-tsconfig-paths";
import { InlineConfig } from "vitest/node";

const entry: Record<string, string> = {
  index: "index.ts",
  storybook: "storybook.ts",
};

export default defineConfig(() => {
  const external = [
    "react",
    "react/jsx-runtime",
    "react-dom",
    /^document-model\//,
    "document-model-libs",
    "@powerhousedao/design-system",
    /^@powerhousedao\/design-system\//,
    "react-i18next",
  ];

  const test: InlineConfig = {
    globals: true,
  };

  return {
    test,
    build: {
      outDir: `dist`,
      emptyOutDir: true,
      lib: {
        entry,
        formats: ["es", "cjs"],
      },
      rollupOptions: {
        external,
        output: {
          manualChunks: (id) => {
            if (
              id.startsWith(path.join(__dirname, "editors")) &&
              /editors\/[^/]+\/editor.tsx/.exec(id)
            ) {
              const editorName = path.basename(path.dirname(id));
              return `editors/${editorName}/editor`;
            } else if (
              id.startsWith(path.join(__dirname, "document-models")) &&
              /document-models\/[^/]+\/index.ts/.exec(id)
            ) {
              const modelName = path.basename(path.dirname(id));
              return `document-models/${modelName}`;
            } else if (id.includes("lazy-with-preload")) {
              return "utils/lazy-with-preload";
            }
          },
          entryFileNames: "[format]/[name].js",
          chunkFileNames: (info) => {
            // creates named chunk for editor components, document-models and utils
            if (info.name.startsWith("editors/")) {
              return `[format]/${info.name}.js`;
            } else if (info.name.startsWith("document-models/")) {
              return `[format]/${info.name}.js`;
            } else if (info.name.startsWith("utils")) {
              return `[format]/${info.name}.js`;
            } else {
              return "[format]/internal/[name]-[hash].js";
            }
          },
        },
      },
    },
    plugins: [
      tsconfigPaths(),
      dts({ insertTypesEntry: true, exclude: ["**/*.stories.tsx"] }),
      generateFile([
        {
          type: "json",
          output: "./es/package.json",
          data: {
            type: "module",
          },
        },
        {
          type: "json",
          output: `./cjs/package.json`,
          data: {
            type: "commonjs",
          },
        },
      ]) as Plugin,
    ],
  };
});
