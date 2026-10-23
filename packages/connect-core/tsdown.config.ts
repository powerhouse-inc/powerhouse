import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const shared: UserConfig = {
  entry: {
    index: "src/index.ts",
    router: "src/router/index.ts",
    "runtime-config": "src/runtime/runtime-config.ts",
    embedded: "src/runtime/embedded.ts",
    plugins: "src/plugins/index.ts",
    runtime: "src/runtime/index.ts",
    views: "src/views/index.ts",
    "route-tree": "src/routeTree.gen.ts",
    // The route files, at dist/routes/<path>.js: Vite pre-bundles a
    // dependency's .js but serves its .tsx unbundled, with the CommonJS it
    // imports.
    "routes/*": "src/routes/**/*.tsx",
  },
  platform: "browser",
  outDir: "dist",
  sourcemap: true,
  // Rollup's file name sanitizing, but keeping `$`, `{` and `}`: the `./routes/*`
  // export maps a route's path to its file, e.g. `_app/d/$driveSlug`.
  outputOptions: {
    sanitizeFileName: (name) =>
      // oxlint-disable-next-line no-control-regex -- control characters are the point
      name.replaceAll(/[\0-\x1F"#%&*+,:;<=>?[\]^`|\x7F]/g, "_"),
  },
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
      // The route files import the router by name, so one copy serves both.
      /^@powerhousedao\/connect-core\//,
    ],
  },
};

// Two passes: in one, rolldown put a JS helper of the dynamic imports in a .d.ts chunk.
export default defineConfig([
  { ...shared, clean: true, dts: false },
  {
    ...shared,
    clean: false,
    dts: { generator: "tsgo", emitDtsOnly: true },
    plugins: [dtsExportList()],
  },
]);
