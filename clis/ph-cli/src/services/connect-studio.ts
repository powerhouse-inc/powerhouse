import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { InlineConfig, Logger } from "vite";
import { createServer, mergeConfig } from "vite";
import type { ConnectStudioArgs } from "../types.js";
import { buildStudioConnectOverride } from "../utils/cli-connect-override.js";

export async function runConnectStudio(
  args: ConnectStudioArgs,
  customLogger?: Logger,
  callerOverride?: PHConnectRuntimeConfig,
) {
  const { port, host, open, cors, strictPort, printUrls, bindCLIShortcuts } =
    args;
  const mode = "development";

  const dirname = process.cwd();

  const cliConnectOverride = buildStudioConnectOverride(args, callerOverride);

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    cliConnectOverride,
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
