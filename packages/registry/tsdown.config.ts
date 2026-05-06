import { defineConfig } from "tsdown";

export default defineConfig([
  // Main registry CLI bundle (ESM — registry's package.json is type:module).
  {
    entry: "./cli.ts",
    outDir: "dist",
    clean: true,
    dts: true,
    sourcemap: true,
  },
  // Verdaccio auth plugin. Must be CJS because verdaccio's plugin loader
  // resolves via `require(<plugins-path>/verdaccio-auth-renown)` without
  // extension — and the plugin sits under a dist tree whose parent
  // package.json declares type:module. We emit a directory with its own
  // package.json that overrides the type back to commonjs and points main
  // at index.cjs.
  {
    entry: {
      "verdaccio-auth-renown/index":
        "./src/auth/verdaccio-auth-renown-plugin.ts",
    },
    format: "cjs",
    outDir: "dist",
    clean: false,
    dts: false,
    sourcemap: true,
    outExtensions: () => ({ js: ".cjs" }),
  },
]);
