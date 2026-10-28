import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { CONTROLLER_PREFIX, TOKEN_META_NAME } from "../controller/api.ts";
import type { MonitorController } from "./controller.ts";
import {
  isLoopbackListen,
  newToken,
  PROJECT_ROOTS_ENV,
  projectRootsFromEnv,
  serverEnvFromEnv,
  shutdown,
  STOP_TIMEOUT_MS,
} from "./hosting.ts";

type Env = Readonly<Record<string, string | undefined>>;

export interface Mounted {
  controller: MonitorController;
  token: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
  onSigint: () => void;
}

export interface MonitorControllerPluginOptions {
  /** Default `process.env`. */
  env?: Env;
  /** Parent of the controller's temp root; default `os.tmpdir()`. */
  tmpDir?: string;
}

// A config restart re-runs the plugin; its children and token carry over.
export const CONTROLLER_SLOT = Symbol.for(
  "@powerhousedao/reactor-monitor-app/controller",
);
type Slotted = typeof globalThis & { [CONTROLLER_SLOT]?: Promise<Mounted> };

async function mount(
  root: string,
  env: Env,
  options: MonitorControllerPluginOptions,
): Promise<Mounted> {
  const [{ createMonitorController }, { createControllerHandler }] =
    await Promise.all([import("./controller.ts"), import("./http.ts")]);
  const controller = createMonitorController({
    projectRoots: projectRootsFromEnv(env),
    serverEnv: serverEnvFromEnv(env),
    checkWorker: path.join(root, "src", "server", "check-worker.ts"),
    stopTimeoutMs: STOP_TIMEOUT_MS,
    ...(options.tmpDir !== undefined ? { tmpDir: options.tmpDir } : {}),
  });
  const token = newToken();
  const onSigint = () => {
    void shutdown(controller).finally(() => process.exit(130));
  };
  process.once("SIGINT", onSigint);
  return {
    controller,
    token,
    handler: createControllerHandler({ controller, token }),
    onSigint,
  };
}

/** Why the controller may not mount on this dev server, if it may not. */
export function refusal(server: ViteDevServer): string | undefined {
  const { host, middlewareMode } = server.config.server;
  if (middlewareMode) return "the dev server runs in middleware mode";
  if (!isLoopbackListen(host)) {
    return `the dev server listens beyond loopback (server.host=${String(host)})`;
  }
  return undefined;
}

/** Dev only: mounts the controller when PH_MONITOR_PROJECT_ROOTS names roots. */
export function monitorController(
  options: MonitorControllerPluginOptions = {},
): Plugin {
  const env = options.env ?? process.env;
  const enabled = () => projectRootsFromEnv(env).length > 0;
  let mounted: Mounted | undefined;
  return {
    name: "ph-monitor-controller",
    apply: "serve",
    // Vite's default dev CORS admits every localhost origin, and index.html carries the token.
    config: () => (enabled() ? { server: { cors: false } } : undefined),
    async configureServer(server) {
      if (!enabled()) return;
      const { logger } = server.config;
      const refused = refusal(server);
      if (refused) {
        logger.warn(`[ph-monitor] controller not mounted: ${refused}.`);
        return;
      }
      const slot = globalThis as Slotted;
      slot[CONTROLLER_SLOT] ??= mount(server.config.root, env, options);
      mounted = await slot[CONTROLLER_SLOT];
      server.middlewares.use(mounted.handler);
      logger.info(
        `[ph-monitor] controller at ${CONTROLLER_PREFIX} for ${PROJECT_ROOTS_ENV}=${projectRootsFromEnv(env).join(path.delimiter)}`,
      );
    },
    transformIndexHtml() {
      if (!mounted) return;
      return [
        {
          tag: "meta",
          attrs: { name: TOKEN_META_NAME, content: mounted.token },
          injectTo: "head",
        },
      ];
    },
  };
}
