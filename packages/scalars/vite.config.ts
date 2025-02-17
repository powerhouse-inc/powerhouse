import { writeFileSync } from "fs";
import { glob } from "glob";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import generateFile from "vite-plugin-generate-file";
import pkg from "./package.json" assert { type: "json" };

const entryObj = glob.sync("src/**/*.ts").reduce(
  (acc, file) => {
    const key = file.replace(/\.ts$/, "");

    return {
      ...acc,
      [key]: file,
    };
  },
  {} as Record<string, string>,
);

const mappedExports = glob
  .sync("src/scalars/**/*.ts")
  .filter((file) => file !== "src/scalars/index.ts")
  .reduce((acc, file) => {
    // remove start src/scalars/ and ending .ts from the path with regexp
    const filePath = file.replace(/^src\/scalars\//, "").replace(/\.ts$/, "");
    let key = filePath;
    // if the key ends with /index, remove it
    if (key.endsWith("/index")) {
      key = key.replace(/\/index$/, "");
    }

    return {
      ...acc,
      [`./${key}`]: {
        types: `./dist/types/src/scalars/${filePath}.d.ts`,
        require: `./dist/cjs/src/scalars/${filePath}.js`,
        import: `./dist/es/src/scalars/${filePath}.js`,
      },
    };
  }, {});

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: entryObj,
      formats: ["es", "cjs"],
    },
    rollupOptions: {
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
    {
      name: "update-package-json",
      closeBundle() {
        const exportsConfig = {
          ".": {
            types: "./dist/types/src/index.d.ts", // TypeScript declarations
            require: "./dist/cjs/src/index.js", // CommonJS entry point
            import: "./dist/es/src/index.js", // ES module entry point
          },
          ...mappedExports,
        };

        const updatedPackageJson = {
          ...pkg,
          exports: exportsConfig,
        };

        writeFileSync(
          "./package.json",
          JSON.stringify(updatedPackageJson, null, 2),
          "utf-8",
        );
        console.log("Root package.json has been updated with exports.");
      },
    },
  ],
});
