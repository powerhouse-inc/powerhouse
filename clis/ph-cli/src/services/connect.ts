import {
  loadVite,
  resolveConnectPublicDir,
  resolveViteConfigPath,
  setConnectEnv,
} from "@powerhousedao/builder-tools";
import type { InlineConfig } from "vite";
import type {
  ConnectBuildArgs,
  ConnectPreviewArgs,
  ConnectStudioArgs,
} from "../types.js";

function assignEnvVars(
  args: ConnectBuildArgs | ConnectPreviewArgs | ConnectStudioArgs,
) {
  const {
    connectBasePath,
    defaultDrivesUrl,
    drivesPreserveStrategy,
    disableLocalPackages,
  } = args;

  setConnectEnv({
    PH_CONNECT_BASE_PATH: connectBasePath,
    PH_CONNECT_DEFAULT_DRIVES_URL: defaultDrivesUrl,
    PH_CONNECT_DRIVES_PRESERVE_STRATEGY: drivesPreserveStrategy,
    PH_DISABLE_LOCAL_PACKAGE: disableLocalPackages,
  });
}

export async function runConnectStudio(args: ConnectStudioArgs) {
  const {
    port,
    host,
    open,
    cors,
    strictPort,
    printUrls,
    bindCLIShortcuts,
    force,
  } = args;
  assignEnvVars(args);
  const vite = await loadVite();
  const mode = "development";
  const projectRoot = process.cwd();

  const viteConfigPath = resolveViteConfigPath({});
  const userViteConfig = await vite.loadConfigFromFile(
    { command: "serve", mode },
    viteConfigPath,
  );

  const connectPublicDir = resolveConnectPublicDir(projectRoot);

  const devServerConfig: InlineConfig = {
    mode,
    configFile: false,
    publicDir: connectPublicDir,
    server: { port, host, open, cors, strictPort },
    optimizeDeps: {
      force,
    },
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
