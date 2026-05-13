import { findWorkspaceDir } from "@pnpm/find-workspace-dir";
import { findWorkspacePackages } from "@pnpm/find-workspace-packages";
import { defineConfig } from "tsdown";

const workspaceDir = await findWorkspaceDir(process.cwd());
const workspacePackages = await findWorkspacePackages(workspaceDir!);

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
  dts: true,
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
