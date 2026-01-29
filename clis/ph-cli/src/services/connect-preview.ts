import {
  loadVite,
  resolveConnectPublicDir,
  resolveViteConfigPath,
} from "@powerhousedao/builder-tools";
import type { InlineConfig } from "vite";
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
  const vite = await loadVite();
  const viteConfigPath = resolveViteConfigPath({});
  const mode = "production";
  const projectRoot = process.cwd();

  assignEnvVars(args);

  const userViteConfig = await vite.loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const previewConfig: InlineConfig = {
    base: connectBasePath,
    publicDir: connectPublicDir,
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

  const mergedConfig = vite.mergeConfig(
    userViteConfig?.config ?? {},
    previewConfig,
  );

  const server = await vite.preview(mergedConfig);

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
