import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { InlineConfig, Logger, ViteDevServer } from "vite";
import { createServer, mergeConfig } from "vite";
import type { ConnectStudioArgs } from "../types.js";
import { buildStudioConnectOverride } from "../utils/cli-connect-override.js";

const CONFIG_FILE = "powerhouse.config.json";
const RELOAD_DEBOUNCE_MS = 200;

export type ConnectStudioOptions = {
  routes?: string | false;
  cacheDir?: string;
  /** Starts a new dev server when powerhouse.config.json changes; the open tab reloads. */
  reloadOnConfigChange?: boolean;
};

function readConfig(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // Missing or mid-edit: nothing to compare yet.
    return undefined;
  }
}

/** Resolves to the first dev server; with reloadOnConfigChange a config change replaces it. */
export async function runConnectStudio(
  args: ConnectStudioArgs,
  customLogger?: Logger,
  callerOverride?:
    | PHConnectRuntimeConfig
    | (() => PHConnectRuntimeConfig | undefined),
  { routes, cacheDir, reloadOnConfigChange }: ConnectStudioOptions = {},
): Promise<ViteDevServer> {
  const { port, host, open, cors, strictPort, printUrls, bindCLIShortcuts } =
    args;
  const mode = "development";

  const dirname = process.cwd();
  const configFile = join(dirname, CONFIG_FILE);

  const start = async (first: boolean) => {
    const override =
      typeof callerOverride === "function" ? callerOverride() : callerOverride;
    const baseConfig = getConnectBaseViteConfig({
      mode,
      dirname,
      cliConnectOverride: buildStudioConnectOverride(args, override),
      routes,
      cacheDir,
    });
    const devServerConfig: InlineConfig = {
      // A restart reloads the open tab rather than opening another.
      server: { port, host, open: first && open, cors, strictPort },
      customLogger,
    };
    const server = await createServer(mergeConfig(baseConfig, devServerConfig));
    await server.listen();
    if (bindCLIShortcuts) server.bindCLIShortcuts({ print: first });
    return server;
  };

  const first = await start(true);
  if (printUrls) first.printUrls();
  if (!reloadOnConfigChange) return first;

  let server = first;
  let loaded = readConfig(configFile);
  let timer: NodeJS.Timeout | undefined;
  let restarts = Promise.resolve();
  const restart = async () => {
    const current = readConfig(configFile);
    if (current === undefined || isDeepStrictEqual(current, loaded)) return;
    loaded = current;
    server.config.logger.info(
      `[connect] ${CONFIG_FILE} changed; restarting Studio with it.`,
      { timestamp: true },
    );
    await server.close();
    server = await start(false);
  };
  // The folder, not the file: editors save by replacing it.
  const watcher = watch(dirname, (_event, file) => {
    if (file !== CONFIG_FILE) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      restarts = restarts.then(restart).catch((error: unknown) => {
        server.config.logger.error(
          `[connect] Could not restart Studio: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, RELOAD_DEBOUNCE_MS);
  });
  watcher.unref();
  return first;
}
