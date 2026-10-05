import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

export default defineConfig({
  entry: [
    "index.mts",
    "src/packages/vite-loader.mts",
    "src/packages/https-hooks.mts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
  loader: { ".graphql": "text" },
  deps: {
    onlyBundle: [],
  },
  define: {
    REACTOR_API_VERSION: JSON.stringify(version),
    REACTOR_API_GIT_SHA: JSON.stringify(gitSha),
  },
});
