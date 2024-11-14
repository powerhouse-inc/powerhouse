import { defineConfig } from "tsup";
import { basename } from "node:path";
import { rmSync } from "node:fs";
import { fixImportsPlugin } from "esbuild-fix-imports-plugin";
import pkg from "./package.json";

// cleans dist folder
rmSync("dist", { recursive: true, force: true });

// builds a .d.ts file for each entry in the package.json exports
function buildDtsEntries(exports: Record<string, string>) {
  const dtsEntries: Record<string, string> = {};
  for (const key in exports) {
    const distPath = exports[key];

    const srcKey = key === "." ? "index" : basename(key, ".js");
    const srcPath = distPath.replace("./dist/", "src/").replace(".js", ".ts");

    dtsEntries[srcKey] = srcPath;
  }

  return dtsEntries;
}

export default defineConfig([
  {
    entry: ["src/**/*.ts"],
    splitting: false,
    sourcemap: true,
    clean: false,
    format: "esm",
    treeshake: true,
    bundle: false,
    esbuildPlugins: [fixImportsPlugin()],
    platform: "node",
    target: "node20",
    cjsInterop: true,
    dts: {
      entry: {
        ...buildDtsEntries(pkg.exports),
        cli: "src/cli.ts",
      },
    },
  },
  {
    entry: ["src/**/.hygen/templates/**/*"],
    outDir: "dist/codegen/.hygen/templates",
    splitting: false,
    sourcemap: true,
    clean: false,
    format: "cjs", // hygen does not support esm
    treeshake: true,
    legacyOutput: true,
    bundle: false,
    platform: "node",
    target: "node20",
    loader: {
      ".esm.t": "copy",
      ".json": "copy",
    },
    cjsInterop: false,
    dts: false,
  },
]);
