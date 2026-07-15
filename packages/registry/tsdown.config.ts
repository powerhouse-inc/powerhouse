import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: "./cli.ts",
    outDir: "dist",
    clean: true,
    dts: true,
    sourcemap: true,
  },
  {
    // Verdaccio auth plugin, loaded via require() from dist/plugins at runtime.
    // Must be CommonJS AND emitted as `.js` — require() won't resolve a `.cjs`
    // by name; the `dist/plugins/package.json {"type":"commonjs"}` (written by
    // copy-dirs) makes the `.js` CommonJS despite the package being type:module.
    entry: { "verdaccio-s3-auth": "./src/auth/s3-auth-plugin.ts" },
    outDir: "dist/plugins",
    format: "cjs",
    clean: false,
    dts: false,
    sourcemap: false,
    outExtensions: () => ({ js: ".js" }),
  },
]);
