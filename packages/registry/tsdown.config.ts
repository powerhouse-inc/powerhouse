import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig([
  {
    entry: "./cli.ts",
    outDir: "dist",
    clean: true,
    dts: { generator: "tsgo" },
    plugins: [dtsExportList()],
    sourcemap: true,
  },
  {
    // Verdaccio auth plugin, loaded via require() from dist/plugins at runtime.
    // Must be CommonJS AND emitted as `.js` — require() won't resolve a `.cjs`
    // by name; the `dist/plugins/package.json {"type":"commonjs"}` (written by
    // copy-dirs) makes the `.js` CommonJS despite the package being type:module.
    entry: { "verdaccio-registry-auth": "./src/auth/registry-auth-plugin.ts" },
    outDir: "dist/plugins",
    format: "cjs",
    clean: false,
    dts: false,
    sourcemap: false,
    outExtensions: () => ({ js: ".js" }),
  },
  {
    // The S3 storage fork, self-contained so the published registry needs no
    // separate package; Verdaccio loads it from dist/plugins by package name
    entry: {
      index: fileURLToPath(
        import.meta.resolve("@powerhousedao/verdaccio-s3-storage"),
      ),
    },
    outDir: "dist/plugins/@powerhousedao/verdaccio-s3-storage",
    format: "cjs",
    platform: "node",
    clean: false,
    dts: false,
    sourcemap: false,
    outExtensions: () => ({ js: ".js" }),
    deps: { alwaysBundle: [/.*/], neverBundle: ["pg-native"] },
  },
]);
