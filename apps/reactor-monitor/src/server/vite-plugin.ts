import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { CONTROLLER_PREFIX, TOKEN_META_NAME } from "../controller/api.ts";
import type { MonitorController } from "./controller.ts";
import {
  isLoopbackListen,
  newToken,
  PROJECT_ROOTS_ENV,
  projectRootsFromEnv,
  shutdown,
  STOP_TIMEOUT_MS,
} from "./hosting.ts";

interface Mounted {
  controller: MonitorController;
  token: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
}

// A config restart re-runs the plugin; its children and token carry over.
const SLOT = Symbol.for("@powerhousedao/reactor-monitor-app/controller");
type Slotted = typeof globalThis & { [SLOT]?: Promise<Mounted> };

async function mount(root: string, projectRoots: string[]): Promise<Mounted> {
  const [{ createMonitorController }, { createControllerHandler }] =
    await Promise.all([import("./controller.ts"), import("./http.ts")]);
  const controller = createMonitorController({
    projectRoots,
    checkWorker: path.join(root, "src", "server", "check-worker.ts"),
    stopTimeoutMs: STOP_TIMEOUT_MS,
  });
  const token = newToken();
  process.once("SIGINT", () => {
    void shutdown(controller).finally(() => process.exit(130));
  });
  return {
    controller,
    token,
    handler: createControllerHandler({ controller, token }),
  };
}

/** Dev only: mounts the controller when PH_MONITOR_PROJECT_ROOTS names roots. */
export function monitorController(): Plugin {
  let mounted: Mounted | undefined;
  return {
    name: "ph-monitor-controller",
    apply: "serve",
    async configureServer(server) {
      const roots = projectRootsFromEnv();
      if (roots.length === 0) return;
      const { logger } = server.config;
      if (!isLoopbackListen(server.config.server.host)) {
        logger.warn(
          `[ph-monitor] controller not mounted: the dev server listens beyond loopback (server.host=${String(server.config.server.host)}).`,
        );
        return;
      }
      const slot = globalThis as Slotted;
      slot[SLOT] ??= mount(server.config.root, roots);
      mounted = await slot[SLOT];
      server.middlewares.use(mounted.handler);
      logger.info(
        `[ph-monitor] controller at ${CONTROLLER_PREFIX} for ${PROJECT_ROOTS_ENV}=${roots.join(path.delimiter)}`,
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
