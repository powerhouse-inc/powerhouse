import {
  commonConnectOptionsToEnv,
  loadVite,
  resolveConnectPublicDir,
  resolveViteConfigPath,
} from "@powerhousedao/builder-tools";
import type { InlineConfig } from "vite";
import type {
  ConnectBuildArgs,
  ConnectPreviewArgs,
  ConnectStudioArgs,
} from "../types.js";

export async function runConnectStudio(args: ConnectStudioArgs) {
  const {
    mode,
    projectRoot,
    port,
    host,
    open,
    cors,
    strictPort,
    force,
    printUrls,
    bindCLIShortcuts,
  } = args;
  commonConnectOptionsToEnv(args);
  const vite = await loadVite();

  const viteConfigPath = resolveViteConfigPath(args);
  const userViteConfig = await vite.loadConfigFromFile(
    { command: "serve", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const devServerConfig: InlineConfig = {
    mode,
    configFile: false,
    publicDir: connectPublicDir,
    forceOptimizeDeps: force,
    server: { port, host, open, cors, strictPort },
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

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { mode, base, outDir, projectRoot } = args;

  commonConnectOptionsToEnv(args);

  const vite = await loadVite();

  const viteConfigPath = resolveViteConfigPath(args);

  const userViteConfig = await vite.loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const buildConfig: InlineConfig = {
    base,
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

export async function runConnectPreview(args: ConnectPreviewArgs) {
  const {
    mode,
    outDir,
    base,
    projectRoot,
    port,
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
  } = args;

  commonConnectOptionsToEnv(args);

  const vite = await loadVite();

  const viteConfigPath = resolveViteConfigPath(args);

  const userViteConfig = await vite.loadConfigFromFile(
    { command: "build", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const previewConfig: InlineConfig = {
    base,
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
