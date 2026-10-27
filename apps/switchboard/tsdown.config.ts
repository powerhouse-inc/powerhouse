import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: [
    "src/index.mts",
    "src/server.mts",
    "src/utils.mts",
    "src/boot.mts",
    "src/config/schema.ts",
    "src/config/from-env.ts",
    "src/install-packages.mts",
    "src/migrate.mts",
    // R2: the built-in plugins, published as subpaths so host.js runner.plugins
    // specifiers resolve from a project's dependency tree.
    "src/plugins/mcp.mts",
    "src/plugins/attachments.mts",
    "src/plugins/privacy.mts",
    "src/plugins/workflows.mts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
