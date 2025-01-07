import { Plugin, UserConfig, defineConfig } from "vite";
import dts from "vite-plugin-dts";
import generateFile from "vite-plugin-generate-file";

function replaceBrowserModules(): Plugin {
  return {
    name: "replace-browser-modules",
    resolveId(source) {
      if (source.endsWith("/node")) {
        return "src/document/utils/browser.ts";
      }
    },
    enforce: "pre",
  };
}

const entry = {
  index: "src/index.ts",
  "document-model": "src/document-model/index.ts",
  document: "src/document/index.ts",
  utils: "src/document/utils/index.ts",
};

export default defineConfig(({ mode = "node" }) => {
  const isBrowser = mode === "browser";
  const external = ["mutative", "jszip", "mime", "zod"];

  // if building for node then don't polyfill node core modules
  if (!isBrowser) {
    external.push("node:path", "node:crypto", "node:fs", "node:https");
  }

  return {
    build: {
      outDir: `dist/${mode}`,
      emptyOutDir: true,
      lib: {
        entry,
        formats: ["es", "cjs"],
      },
      rollupOptions: {
        external,
        output: {
          entryFileNames: "[format]/[name].js",
          chunkFileNames: "[format]/internal/[name]-[hash].js",
          exports: "named",
        },
      },
      sourcemap: true,
      minify: false,
    },
    plugins: [
      isBrowser ? replaceBrowserModules() : undefined,
      dts({ insertTypesEntry: true }),
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
      ]),
    ],
  } as UserConfig;
});
