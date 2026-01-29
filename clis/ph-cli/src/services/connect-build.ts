import {
  loadVite,
  resolveConnectPublicDir,
  resolveViteConfigPath,
} from "@powerhousedao/builder-tools";
import type { InlineConfig } from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { connectBasePath, outDir } = args;
  const mode = "production";
  const projectRoot = process.cwd();
  const vite = await loadVite();
  const viteConfigPath = resolveViteConfigPath({});

  assignEnvVars(args);

  const userViteConfig = await vite.loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const buildConfig: InlineConfig = {
    base: connectBasePath,
    publicDir: connectPublicDir,
    mode,
    configFile: false,
    build: {
      outDir,
    },
  };

  const mergedConfig = vite.mergeConfig(
    userViteConfig?.config ?? {},
    buildConfig,
  );

  await vite.build(mergedConfig);
}
