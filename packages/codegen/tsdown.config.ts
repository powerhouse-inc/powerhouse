import { findWorkspaceDir } from "@pnpm/find-workspace-dir";
import { findWorkspacePackages } from "@pnpm/find-workspace-packages";
import { defineConfig } from "tsdown";

const workspaceDir = await findWorkspaceDir(process.cwd());
const workspacePackages = await findWorkspacePackages(workspaceDir!);

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
    WORKSPACE_PACKAGES: JSON.stringify(
      workspacePackages
        .filter(({ manifest }) => manifest.name !== "root" && !manifest.private)
        .map(({ dir, manifest }) => ({
          dir,
          manifest,
        })),
    ),
  },
});
