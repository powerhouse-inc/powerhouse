import {
  loadVite,
  resolveConnectPublicDir,
  resolveViteConfigPath,
} from "@powerhousedao/builder-tools";
import type { InlineConfig, Logger } from "vite";
import type { ConnectStudioArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";

export async function runConnectStudio(
  args: ConnectStudioArgs,
  viteLogger?: Logger,
) {
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
    customLogger: viteLogger,
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
