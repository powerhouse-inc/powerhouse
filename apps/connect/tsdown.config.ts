import { defineConfig } from "tsdown";

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

export default defineConfig({
  entry: {
    "start-connect": "start-connect.tsx",
    main: "main.tsx",
    "pglite.worker": "pglite.worker.ts",
    "pglite.worker.legacy": "pglite.worker.legacy.ts",
    "reactor.worker": "src/reactor.worker.ts",
  },
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
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
  },
});
