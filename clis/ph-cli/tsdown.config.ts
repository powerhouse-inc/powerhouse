import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA ?? "unknown";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    // uniform-runners bridge runners, published as package subpaths so a
    // scaffolded project's hosts/<name>/host.js can name them as runner.module
    // and resolve them from its own node_modules (ph-cli is a devDependency).
    "runners/connect": "src/runners/connect.ts",
    "runners/switchboard": "src/runners/switchboard.ts",
    "runners/compound": "src/runners/compound.ts",
  },
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
