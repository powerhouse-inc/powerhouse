import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import generateFile from "vite-plugin-generate-file";
import pkg from "./package.json";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: ["src/index.ts"],
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: Object.keys(pkg.peerDependencies),
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
    dts({ insertTypesEntry: true, outDir: "dist/types" }),
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
});
