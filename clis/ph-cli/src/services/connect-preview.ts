import {
  loadConfigFromFile,
  mergeConfig,
  preview,
  type InlineConfig,
} from "vite";
import type { ConnectPreviewArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";

export async function runConnectPreview(args: ConnectPreviewArgs) {
  const {
    outDir,
    connectBasePath,
    port,
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
  } = args;
  const mode = "production";

  assignEnvVars(args);

  const previewConfig: InlineConfig = {
    base: connectBasePath,
    mode,
    configFile: false,
    build: {
      outDir,
    },
    preview: {
      cors,
      port,
      strictPort,
      host,
      open,
    },
  };

  const server = await preview(previewConfig);

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
