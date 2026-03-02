import {
  build,
  loadConfigFromFile,
  mergeConfig,
  type InlineConfig,
} from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";
import {
  resolveConnectPublicDir,
  resolveViteConfigPath,
} from "../utils/resolve-connect-dirs.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { connectBasePath, outDir } = args;
  const mode = "production";
  const projectRoot = process.cwd();
  const viteConfigPath = resolveViteConfigPath({});

  assignEnvVars(args);

  const userViteConfig = await loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  // const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const buildConfig: InlineConfig = {
    base: connectBasePath,
    // publicDir: connectPublicDir,
    mode,
    configFile: false,
    build: {
      outDir,
    },
  };

  const mergedConfig = mergeConfig(userViteConfig?.config ?? {}, buildConfig);

  await build(mergedConfig);
}
