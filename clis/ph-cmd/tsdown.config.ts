import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const version =
  process.env.WORKSPACE_VERSION || process.env.npm_package_version || "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA || "unknown";

export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
  define: {
    CLI_VERSION: JSON.stringify(version),
    CLI_GIT_SHA: JSON.stringify(gitSha),
  },
});
