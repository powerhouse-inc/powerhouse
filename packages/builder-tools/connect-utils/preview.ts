import type { InlineConfig } from "vite";
import {
  commonConnectOptionsToEnv,
  DEFAULT_CONNECT_OUTDIR,
  loadVite,
  resolveViteConfigPath,
} from "./helpers.js";
import type { ConnectPreviewOptions } from "./types.js";

export async function previewConnect(options: ConnectPreviewOptions = {}) {
  const { mode = "production" } = options;

  commonConnectOptionsToEnv(options);

  const vite = await loadVite();

  const viteConfigPath = resolveViteConfigPath(options);

  const userViteConfig = await vite.loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const previewConfig: InlineConfig = {
    base: options.base,
    mode,
    configFile: false,
    build: {
      outDir: options.outDir ?? DEFAULT_CONNECT_OUTDIR,
    },
    preview: {
      port: options.port,
      strictPort: options.strictPort,
      host: options.host,
      open: options.open,
    },
  };

  const mergedConfig = vite.mergeConfig(
    userViteConfig?.config ?? {},
    previewConfig,
  );

  const server = await vite.preview(mergedConfig);

  if (options.printUrls !== false) {
    server.printUrls();
  }
  if (options.bindCLIShortcuts !== false) {
    server.bindCLIShortcuts();
  }
}
