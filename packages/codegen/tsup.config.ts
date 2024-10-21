import { defineConfig } from "tsup";
import { basename } from "node:path";
import pkg from "./package.json";

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

export default defineConfig({
  entry: ["src/**/*.ts", "src/**/.hygen/templates/**/*"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: "cjs",
  treeshake: true,
  bundle: false,
  platform: "node",
  target: "node20",
  legacyOutput: true,
  loader: {
    ".esm.t": "copy",
  },
  dts: {
    entry: {
      ...buildDtsEntries(pkg.exports),
      cli: "src/cli.ts",
    },
  },
});
