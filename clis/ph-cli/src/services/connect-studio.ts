import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import {
  createServer,
  mergeConfig,
  type InlineConfig,
  type Logger,
} from "vite";
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
  const mode = "development";

  const dirname = process.cwd();

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    localPackage: dirname,
  });

  const devServerConfig: InlineConfig = {
    mode,
    configFile: false,
    server: { port, host, open, cors, strictPort },
    optimizeDeps: {
      force,
    },
    customLogger: viteLogger,
  };

  const config = mergeConfig(baseConfig, devServerConfig);

  const server = await createServer(config);

  await server.listen();

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
