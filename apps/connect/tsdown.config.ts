import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

export default defineConfig({
  entry: {
    "start-connect": "start-connect.tsx",
    main: "main.tsx",
    router: "src/router/index.ts",
    layout: "src/layout/index.ts",
    generic: "src/generic/index.ts",
    "route-tree": "src/route-tree.ts",
    "route-views": "src/route-views/index.ts",
    prerender: "src/prerender/shell.tsx",
    "pglite.worker": "pglite.worker.ts",
    "pglite.worker.legacy": "pglite.worker.legacy.ts",
    "reactor.worker": "src/reactor.worker.ts",
  },
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
      "@powerhousedao/connect/fonts.css",
      // Resolved by the project build, which may swap in a tree with its routes.
      "@powerhousedao/connect/route-tree",
      // Resolved by the project build (builder-tools' phBundledPackagesPlugin).
      "ph-bundled-packages-virtual",
      // Shared with project code, which registers routes and plugins on it.
      /^@powerhousedao\/connect-core(\/.*)?$/,
    ],
  },
  loader: {
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".gif": "dataurl",
    ".webp": "dataurl",
    ".avif": "dataurl",
    ".svg": "dataurl",
    ".mp4": "dataurl",
  },
  define: {
    CONNECT_VERSION: JSON.stringify(version),
    CONNECT_GIT_SHA: JSON.stringify(gitSha),
    CONNECT_PACKAGED_DIST: "true",
  },
});
