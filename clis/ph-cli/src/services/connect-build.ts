import {
  build,
  loadConfigFromFile,
  mergeConfig,
  type InlineConfig,
} from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";
import { resolveViteConfigPath } from "../utils/resolve-connect-dirs.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { connectBasePath, outDir } = args;
  const mode = "production";
  const viteConfigPath = resolveViteConfigPath({});

  assignEnvVars(args);

  const userViteConfig = await loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const buildConfig: InlineConfig = {
    base: connectBasePath,
    mode,
    configFile: false,
    build: {
      outDir,
    },
  };

  const mergedConfig = mergeConfig(userViteConfig?.config ?? {}, buildConfig);

  await build(mergedConfig);
}
