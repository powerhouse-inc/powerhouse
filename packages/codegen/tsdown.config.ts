import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

const workspacePackages = (
  JSON.parse(
    execFileSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    }),
  ) as { path: string }[]
).map(({ path }) => ({
  dir: path,
  manifest: JSON.parse(readFileSync(join(path, "package.json"), "utf8")) as {
    name?: string;
    private?: boolean;
  },
}));

const version =
  process.env.WORKSPACE_VERSION ?? process.env.npm_package_version ?? "unknown";

export default defineConfig({
  entry: [
    "index.mts",
    "src/templates/index.mts",
    "src/file-builders/index.mts",
    "src/name-builders/index.mts",
    "src/utils/index.mts",
  ],
  outDir: "dist",
  platform: "node",
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  clean: true,
  sourcemap: true,
  define: {
    /* Make the list of packages in this monorepo globally available
     * Useful for codegen processes which need to reference internal package names and versions */
    WORKSPACE_PACKAGES: JSON.stringify(
      workspacePackages
        .filter(({ manifest }) => manifest.name !== "root" && !manifest.private)
        .map(({ dir, manifest }) => ({
          dir,
          manifest,
        })),
    ),
    CODEGEN_VERSION: JSON.stringify(version),
  },
});
