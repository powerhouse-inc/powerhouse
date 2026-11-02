import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/runner.ts"],
    outDir: "dist",
    // runs in the Node CLI context (ph run desktop …)
    platform: "node",
    clean: true,
    dts: { generator: "tsgo" },
    plugins: [dtsExportList()],
    sourcemap: true,
  },
  {
    // The local key's process. The packaged stack holds ph-cli and not this
    // package, so it carries everything it needs and is staged on its own.
    entry: { "local-key": "src/local-key-cli.ts" },
    outDir: "dist/local-key",
    platform: "node",
    format: "esm",
    clean: false,
    dts: false,
    noExternal: [/.*/],
    outputOptions: { inlineDynamicImports: true },
  },
  {
    // The shell's sign-in page: a browser script with everything inside it,
    // copied beside the page by `projectShell`.
    entry: { "sign-in": "src/sign-in/main.ts" },
    outDir: "dist/sign-in",
    platform: "browser",
    format: "esm",
    clean: false,
    dts: false,
    noExternal: [/.*/],
    // One file: only that file is copied beside the page, and viem loads its
    // signature code by dynamic import.
    outputOptions: { inlineDynamicImports: true },
    minify: true,
  },
]);
