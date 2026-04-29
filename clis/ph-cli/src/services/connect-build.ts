import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { getConfig } from "@powerhousedao/shared/clis";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InlineConfig } from "vite";
import { build, mergeConfig } from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";
import { runBuild } from "./build.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { outDir, debug } = args;
  assignEnvVars(args);

  const mode = "production";
  const dirname = process.cwd();

  // Fail fast if any package marked as provider: "local" is missing from
  // node_modules — the Vite plugin that bundles them needs them on disk.
  assertLocalPackagesInstalled(dirname);

  await runBuild({
    outDir: "dist",
    debug,
  });

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
  });

  const buildConfig: InlineConfig = {
    build: {
      outDir,
    },
  };

  const config = mergeConfig(baseConfig, buildConfig);

  await build(config);
}

function assertLocalPackagesInstalled(projectPath: string) {
  const config = getConfig(join(projectPath, "powerhouse.config.json"));
  const localPackages = (config.packages ?? []).filter(
    (p) => p.provider === "local",
  );
  if (localPackages.length === 0) return;

  const missing = localPackages.filter(
    (p) =>
      !existsSync(
        join(projectPath, "node_modules", p.packageName, "package.json"),
      ),
  );
  if (missing.length === 0) return;

  const names = missing.map((p) => p.packageName);
  throw new Error(
    `ph connect build requires these packages to be installed in node_modules (they are declared with provider: "local" in powerhouse.config.json):\n` +
      names.map((n) => `  - ${n}`).join("\n") +
      `\n\nInstall them with:\n  ph install --local ${names.join(" ")}`,
  );
}
