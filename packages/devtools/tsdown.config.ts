import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";
import { cssText } from "./css-text.mjs";

export default defineConfig([
  {
    // Self-contained: its own React and every dependency, so it mounts on a
    // page of any app.
    entry: { mount: "src/mount.tsx" },
    platform: "browser",
    outDir: "dist",
    clean: true,
    minify: true,
    sourcemap: false,
    dts: { generator: "tsgo" },
    plugins: [dtsExportList(), cssText()],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    deps: { alwaysBundle: [/./] },
    inputOptions: {
      // Base UI marks its modules "use client", which a bundle cannot keep.
      onLog(level, log, handler) {
        if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
      },
    },
  },
  {
    // What the dev server serves the page. The page's project resolves
    // their imports: the mount, and the app's own packages.
    entry: {
      "client-page": "src/client/page.ts",
      "client-connect": "src/client/connect.tsx",
    },
    platform: "browser",
    outDir: "dist",
    clean: false,
    sourcemap: false,
    dts: false,
    deps: {
      neverBundle: [/^virtual:/, /^@powerhousedao\//, /^react(-dom)?(\/|$)/],
    },
  },
  {
    entry: { server: "src/server/index.ts", connect: "src/connect/index.ts" },
    platform: "node",
    outDir: "dist",
    clean: false,
    sourcemap: true,
    dts: { generator: "tsgo" },
    plugins: [dtsExportList()],
  },
]);
