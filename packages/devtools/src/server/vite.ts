import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { ProjectReader } from "../api.js";
import { DEVTOOLS_BASE_ATTRIBUTE } from "../host.js";
import { DEVTOOLS_TOKEN_META } from "../paths.js";
import { onLoopbackSocket } from "./guards.js";
import { createDevtoolsApiHandler, createDevtoolsToken } from "./handler.js";
import { createProjectReader } from "./project/reader.js";
import { readStack, type DevtoolsRun } from "./stack.js";

/** What the page loads. `connect` also does what DevTools needs from a
 * Connect app: its page route and what the app knows. */
export type DevtoolsClient = "page" | "connect";

export type DevtoolsVitePluginOptions = {
  /** The folder of the project the dev server runs. The working directory
   * by default. */
  projectRoot?: string;
  /** What the tool that started the dev server knows of the run. */
  run?: () => DevtoolsRun;
  /** In place of the reader DevTools makes for `projectRoot`. */
  project?: ProjectReader;
  /** "page" by default: DevTools mounted on the page, and nothing else. */
  client?: DevtoolsClient;
};

/** The module the page loads, and the one its code imports the mount from. */
export const DEVTOOLS_CLIENT_ID = "virtual:ph-devtools/client";
const MOUNT_ID = "virtual:ph-devtools/mount";

const CLIENT_FILE: Record<DevtoolsClient, string> = {
  page: "client-page.js",
  connect: "client-connect.js",
};

/** A file of this package's build, from its source and from its build. */
function built(file: string): string {
  const manifest = createRequire(import.meta.url).resolve(
    "@powerhousedao/devtools/package.json",
  );
  return join(dirname(manifest), "dist", file);
}

/** Whether this run serves DevTools: `PH_DEVTOOLS=0` turns it off, and so
 * does `NODE_ENV=production`, whatever the server is. */
export function devtoolsRequested(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.PH_DEVTOOLS !== "0" && env.NODE_ENV !== "production";
}

/**
 * DevTools for a Vite dev server: the loopback API, the token tag that turns
 * DevTools on in the page, and the module that mounts it there. It applies
 * to a dev server only, never to a build or a preview, and not at all under
 * `PH_DEVTOOLS=0` or `NODE_ENV=production`: a build has no reference to
 * DevTools. A page the server sends to another machine (`--host`) gets
 * neither the tag nor the module: the API would refuse it.
 *
 * One token for the plugin's life, so the servers a config change restarts
 * keep answering the tab that is already open.
 */
export function devtoolsVitePlugin({
  projectRoot = process.cwd(),
  run,
  project = createProjectReader(projectRoot),
  client = "page",
}: DevtoolsVitePluginOptions = {}): Plugin {
  const token = createDevtoolsToken();
  // The server a config change restarts replaces the one before it.
  let serving: ViteDevServer | undefined;
  // Whether the request being answered came in on loopback. Vite does not
  // hand `transformIndexHtml` the request.
  const fromLoopback = new AsyncLocalStorage<boolean>();
  return {
    name: "ph-devtools",
    apply: (_config, env) =>
      env.command === "serve" && !env.isPreview && devtoolsRequested(),
    resolveId(id) {
      if (id === DEVTOOLS_CLIENT_ID) return `\0${DEVTOOLS_CLIENT_ID}`;
      if (id === MOUNT_ID) return built("mount.js");
      return undefined;
    },
    // Served as a module of the project, not of this package: its imports of
    // the app's own packages resolve as the project's code does.
    load(id) {
      return id === `\0${DEVTOOLS_CLIENT_ID}`
        ? readFileSync(built(CLIENT_FILE[client]), "utf8")
        : undefined;
    },
    configureServer(server) {
      // Ahead of Vite's own middlewares, so the HTML fallback never answers
      // an API path.
      serving = server;
      server.middlewares.use((req, _res, next) =>
        fromLoopback.run(onLoopbackSocket(req), next),
      );
      server.middlewares.use(
        createDevtoolsApiHandler({
          token,
          base: server.config.base,
          info: () =>
            readStack({
              projectRoot,
              run,
              appUrl: () => serving?.resolvedUrls?.local[0],
            }),
          project,
        }),
      );
    },
    transformIndexHtml(_html, { server }) {
      // Outside a request of this server's, a host that renders the page
      // itself asked: it serves whom it chooses.
      if (fromLoopback.getStore() === false) return [];
      const base = server?.config.base ?? "/";
      return [
        {
          tag: "meta",
          attrs: {
            name: DEVTOOLS_TOKEN_META,
            content: token,
            [DEVTOOLS_BASE_ATTRIBUTE]: base,
          },
          injectTo: "head",
        },
        {
          tag: "script",
          attrs: { type: "module", src: `${base}@id/${DEVTOOLS_CLIENT_ID}` },
          injectTo: "head",
        },
      ];
    },
  };
}
