import type { InlineConfig } from "vite";
import {
  commonConnectOptionsToEnv,
  DEFAULT_CONNECT_OUTDIR,
  loadVite,
  resolveConnectPublicDir,
  resolveViteConfigPath,
} from "./helpers.js";
import type { ConnectBuildOptions } from "./types.js";

export async function buildConnect(options: ConnectBuildOptions = {}) {
  const { mode = "production" } = options;

  commonConnectOptionsToEnv(options);

  const vite = await loadVite();

  const viteConfigPath = resolveViteConfigPath(options);

  const userViteConfig = await vite.loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(options.projectRoot);

  const buildConfig: InlineConfig = {
    base: options.base,
    publicDir: connectPublicDir,
    mode,
    configFile: false,
    build: {
      outDir: options.outDir ?? DEFAULT_CONNECT_OUTDIR,
    },
  };

  const mergedConfig = vite.mergeConfig(
    userViteConfig?.config ?? {},
    buildConfig,
  );

  await vite.build(mergedConfig);
}
