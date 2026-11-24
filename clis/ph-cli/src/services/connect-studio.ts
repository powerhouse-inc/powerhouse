import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import {
  resolveServedFiles,
  servedFilesStep,
} from "@powerhousedao/ph-run/connect-serve";
import {
  localSignInStep,
  type LocalSignInOptions,
  type LocalSignInStep,
} from "@powerhousedao/ph-run/local-sign-in";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import { readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { InlineConfig, Logger, Plugin, ViteDevServer } from "vite";
import { createServer, mergeConfig } from "vite";
import type { ConnectStudioArgs } from "../types.js";
import { buildStudioConnectOverride } from "../utils/cli-connect-override.js";
import { switchboardProxy } from "../utils/switchboard-proxy.js";

const CONFIG_FILE = "powerhouse.config.json";
const RELOAD_DEBOUNCE_MS = 200;

export type ConnectStudioOptions = {
  routes?: string | false;
  cacheDir?: string;
  /** Starts a new dev server when powerhouse.config.json changes; the open tab reloads. */
  reloadOnConfigChange?: boolean;
  /** The switchboard origin whose paths this server proxies (runner.proxy). */
  proxy?: string;
  /** Files served by name, read against the working directory at each
   * request (runner.serveFiles), as the servers of a build serve them. */
  serveFiles?: Readonly<Record<string, string>>;
  /** Runs before a config change replaces the server, for a caller whose
   * override follows the config too. When it rejects, the server stays. */
  beforeRestart?: () => Promise<void>;
  /** Runs each restart's server start, for a caller that started the first
   * one inside a wrapper of its own. */
  restartWith?: (start: () => Promise<ViteDevServer>) => Promise<ViteDevServer>;
  /** Handed what stops Studio for good, before it resolves: the config
   * watcher and whichever server is current. The first server's own `close`
   * stops neither once a config change has replaced it. */
  exposeStop?: (stop: () => Promise<void>) => void;
  /** Sign-in by link: the loopback endpoint every server of this Studio
   * serves (F3d). One for all of them, so a code taken stays taken. */
  localSignIn?: Omit<LocalSignInOptions, "port" | "base">;
};

/** Where a dev server listens. */
function portOf(server: ViteDevServer | undefined): number | undefined {
  const address = server?.httpServer?.address();
  return typeof address === "object" && address ? address.port : undefined;
}

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
  {
    routes,
    cacheDir,
    reloadOnConfigChange,
    proxy,
    serveFiles,
    beforeRestart,
    restartWith,
    exposeStop,
    localSignIn,
  }: ConnectStudioOptions = {},
): Promise<ViteDevServer> {
  const { port, host, open, cors, strictPort, printUrls, bindCLIShortcuts } =
    args;
  const mode = "development";

  const dirname = process.cwd();
  const configFile = join(dirname, CONFIG_FILE);
  // Ahead of vite's own middlewares (its SPA fallback among them), under the
  // base vite serves at.
  const servedFiles: Plugin | undefined = serveFiles && {
    name: "ph:serve-files",
    configureServer(server) {
      server.middlewares.use(
        servedFilesStep(
          resolveServedFiles(serveFiles, dirname),
          server.config.base,
        ),
      );
    },
  };
  // Ahead of vite's CORS: it answers this computer's pages only. Made with
  // the first server and kept by the next ones.
  const current: { server?: ViteDevServer; step?: LocalSignInStep } = {};
  const signInPlugin: Plugin | undefined = localSignIn && {
    name: "ph:local-sign-in",
    configureServer(server) {
      current.server = server;
      current.step ??= localSignInStep({
        ...localSignIn,
        base: server.config.base,
        port: () => portOf(current.server),
      });
      server.middlewares.use(current.step);
    },
  };
  const plugins = [
    ...(signInPlugin ? [signInPlugin] : []),
    ...(servedFiles ? [servedFiles] : []),
  ];

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
      server: {
        port,
        host,
        open: first && open,
        cors,
        strictPort,
        ...(proxy ? { proxy: switchboardProxy(proxy) } : {}),
      },
      customLogger,
      ...(plugins.length > 0 ? { plugins } : {}),
    };
    const server = await createServer(mergeConfig(baseConfig, devServerConfig));
    await server.listen();
    if (bindCLIShortcuts) server.bindCLIShortcuts({ print: first });
    return server;
  };

  let loaded = reloadOnConfigChange ? readConfig(configFile) : undefined;
  const first = await start(true);
  if (printUrls) first.printUrls();
  if (!reloadOnConfigChange) {
    exposeStop?.(() => {
      current.step?.dispose();
      return first.close();
    });
    return first;
  }

  let server = first;
  let timer: NodeJS.Timeout | undefined;
  let restarts = Promise.resolve();
  let stopped = false;
  const restart = async () => {
    if (stopped) return;
    const current = readConfig(configFile);
    if (current === undefined || isDeepStrictEqual(current, loaded)) return;
    loaded = current;
    server.config.logger.info(
      `[connect] ${CONFIG_FILE} changed; restarting Studio with it.`,
      { timestamp: true },
    );
    await beforeRestart?.();
    await server.close();
    server = await (restartWith
      ? restartWith(() => start(false))
      : start(false));
  };
  const queueRestart = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      restarts = restarts.then(restart).catch((error: unknown) => {
        server.config.logger.error(
          `[connect] Could not restart Studio: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, RELOAD_DEBOUNCE_MS);
  };
  // The folder, not the file: editors save by replacing it.
  const watcher = watch(dirname, (_event, file) => {
    if (file === CONFIG_FILE) queueRestart();
  });
  watcher.unref();
  exposeStop?.(async () => {
    stopped = true;
    clearTimeout(timer);
    watcher.close();
    current.step?.dispose();
    // A restart under way ends first: it leaves the server to close.
    await restarts;
    await server.close();
  });
  // Catch config edits made while the first server was starting.
  queueRestart();
  return first;
}
