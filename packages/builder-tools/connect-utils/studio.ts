import type { InlineConfig } from "vite";
import {
  commonConnectOptionsToEnv,
  loadVite,
  resolveViteConfigPath,
} from "./helpers.js";
import type { ConnectStudioOptions } from "./types.js";

export const ConnectStudioDefaultOptions = {
  printUrls: true,
  bindCLIShortcuts: true,
} as const satisfies ConnectStudioOptions;

export async function startConnectStudio(
  options: ConnectStudioOptions = ConnectStudioDefaultOptions,
) {
  const {
    mode = "development",
    printUrls,
    bindCLIShortcuts,
    devServerOptions,
  } = {
    ...ConnectStudioDefaultOptions,
    ...options,
  };

  commonConnectOptionsToEnv(options);

  const vite = await loadVite();

  const viteConfigPath = resolveViteConfigPath(options);
  const userViteConfig = await vite.loadConfigFromFile(
    { command: "serve", mode },
    viteConfigPath,
  );

  const devServerConfig: InlineConfig = {
    mode,
    configFile: false,
    server: devServerOptions,
  };

  const mergedConfig = vite.mergeConfig(
    userViteConfig?.config ?? {},
    devServerConfig,
  );

  const server = await vite.createServer(mergedConfig);

  await server.listen();

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
