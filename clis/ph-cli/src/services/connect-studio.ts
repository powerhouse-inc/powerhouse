import {
  createServer,
  loadConfigFromFile,
  mergeConfig,
  type InlineConfig,
  type Logger,
} from "vite";
import type { ConnectStudioArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";
import { resolveViteConfigPath } from "../utils/resolve-connect-dirs.js";

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
  const mode = "development";
  const projectRoot = process.cwd();

  const viteConfigPath = resolveViteConfigPath({});
  const userViteConfig = await loadConfigFromFile(
    { command: "serve", mode },
    viteConfigPath,
  );

  const devServerConfig: InlineConfig = {
    mode,
    configFile: false,
    server: { port, host, open, cors, strictPort },
    optimizeDeps: {
      force,
    },
    customLogger: viteLogger,
  };

  const mergedConfig = mergeConfig(
    userViteConfig?.config ?? {},
    devServerConfig,
  );

  const server = await createServer(mergedConfig);

  await server.listen();

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
