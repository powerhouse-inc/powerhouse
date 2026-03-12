import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { InlineConfig, Logger } from "vite";
import { createServer, mergeConfig } from "vite";
import type { ConnectStudioArgs } from "../types.js";
import { assignEnvVars } from "../utils/assign-env-vars.js";

export async function runConnectStudio(
  args: ConnectStudioArgs,
  customLogger?: Logger,
) {
  const { port, host, open, cors, strictPort, printUrls, bindCLIShortcuts } =
    args;
  assignEnvVars(args);
  const mode = "development";

  const dirname = process.cwd();

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
  });

  const devServerConfig: InlineConfig = {
    server: { port, host, open, cors, strictPort },
    customLogger,
  };

  const config = mergeConfig(baseConfig, devServerConfig);

  const server = await createServer(config);

  await server.listen();

  if (printUrls) server.printUrls();
  if (bindCLIShortcuts) server.bindCLIShortcuts({ print: true });
}
