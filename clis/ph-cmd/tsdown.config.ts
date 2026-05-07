import { defineConfig } from "tsdown";

const version =
  process.env.WORKSPACE_VERSION || process.env.npm_package_version || "unknown";
const gitSha = process.env.WORKSPACE_GIT_SHA || "unknown";

export default defineConfig({
  entry: ["src/cli.ts", "src/generate-commands-docs.ts"],
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  define: {
    CLI_VERSION: JSON.stringify(version),
    CLI_GIT_SHA: JSON.stringify(gitSha),
  },
});
