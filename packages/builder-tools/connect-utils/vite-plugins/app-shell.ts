import { existsSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import type {
  Alias,
  ErrorPayload,
  Plugin,
  ResolvedConfig,
  ViteDevServer,
} from "vite";
import { createServer } from "vite";
import {
  APP_SHELLS_FILE,
  appShellVariant,
  injectAppShell,
  readShellPluginsIn,
  SHELL_PLUGINS_FILE,
  type AppShell,
  type AppShells,
  type AppShellVariant,
  type ShellPlugins,
} from "@powerhousedao/shared/connect/app-shell";
import { resolvePackage } from "../helpers.js";
import { withHostStylesheet } from "./host-stylesheet.js";
import { withNodeDedupe } from "./node-dedupe.js";
import { replaceShellLoader, type ProjectLoader } from "./project-brand.js";

export * from "@powerhousedao/shared/connect/app-shell";

const SHELL_FILES: Record<AppShellVariant, string> = {
  generic: "shell",
  core: "shell-core",
};

function connectDistDir(projectRoot: string): string | undefined {
  try {
    return join(
      dirname(
        resolvePackage("@powerhousedao/connect/package.json", projectRoot),
      ),
      "dist",
    );
  } catch {
    return undefined;
  }
}

/** The shell manifest of the installed Connect, if it ships one. */
export function readShellPlugins(
  projectRoot: string,
): ShellPlugins | undefined {
  const distDir = connectDistDir(projectRoot);
  return distDir ? readShellPluginsIn(distDir) : undefined;
}

/** The shell Connect's build prerendered, if the installed Connect ships one. */
export function readAppShell(
  projectRoot: string,
  variant: AppShellVariant = "generic",
): AppShell | undefined {
  const distDir = connectDistDir(projectRoot);
  if (!distDir) return undefined;
  const body = join(distDir, `${SHELL_FILES[variant]}.html`);
  const head = join(distDir, `${SHELL_FILES[variant]}-head.html`);
  if (!existsSync(body) || !existsSync(head)) return undefined;
  return {
    body: readFileSync(body, "utf8"),
    head: readFileSync(head, "utf8"),
  };
}

/** Every variant the installed Connect ships. */
export function readAppShells(projectRoot: string): AppShells {
  const shells: AppShells = {};
  for (const variant of Object.keys(SHELL_FILES) as AppShellVariant[]) {
    const shell = readAppShell(projectRoot, variant);
    if (shell) shells[variant] = shell;
  }
  return shells;
}

export type ConnectAppShellOptions = {
  /** The composition the app boots with; picks the variant. */
  composition?: readonly { module: string }[] | null;
  /** The served `connect.branding.appName`. */
  appName?: string;
  /** With the project's routes: the aliases that point Connect at its tree. */
  routeAliases?: Alias[];
  /** The project's routes folder; dev renders the shell again when it changes. */
  routesDir?: string;
  /** The project's loading image, in place of the shell's logo. */
  loader?: ProjectLoader;
  /** The host's stylesheet, which the page's build adds to the project's. */
  hostStylesheet?: string;
};

// The first page waits this long for the project's shell; later ones have it.
const DEV_SHELL_WAIT_MS = 10_000;

// The packages whose code the shell renders; a workspace links them, so only
// an installed Connect needs them named.
const CONNECT_PACKAGES = [
  "@powerhousedao/connect",
  "@powerhousedao/connect-core",
];

type ShellRenderer = {
  renderProjectShells: (stylesheet: string, css?: string) => Promise<AppShells>;
};

// Connect's renderer, loaded through Vite with the project's aliases, so it
// renders the project's route tree; its route files are TSX.
async function renderProjectAppShells(
  projectRoot: string,
  config: ResolvedConfig,
  routeAliases: Alias[],
  hostStylesheet: string | undefined,
): Promise<AppShells> {
  const server = await createServer({
    configFile: false,
    root: projectRoot,
    logLevel: "error",
    appType: "custom",
    // No watcher: it renders once and closes, and chokidar would otherwise
    // crawl the whole project (.ph stores and attachments included) meanwhile,
    // one synchronous fs.watch per file on Windows.
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    // Vite's own JSX transform: React's plugin would pre-bundle React for a client.
    oxc: { jsx: { runtime: "automatic" } },
    resolve: {
      alias: routeAliases,
      dedupe: config.resolve.dedupe,
      tsconfigPaths: true,
    },
    define: config.define,
    // Its own cache and no dep optimizing: it runs beside the project's dev
    // server, whose node_modules/.vite deps it would otherwise rewrite.
    cacheDir: join(projectRoot, "node_modules/.vite-ph-prerender"),
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    ssr: {
      optimizeDeps: { noDiscovery: true, include: [] },
      // Through Vite, not Node: their code reads import.meta.env, which only
      // Vite defines. Installed from npm they'd be external, and Node's is undefined.
      noExternal: CONNECT_PACKAGES,
    },
  });
  try {
    // What the server externalizes loads through Node: dedupe there too.
    return await withNodeDedupe(
      projectRoot,
      config.resolve.dedupe,
      async () => {
        const renderer = (await server.ssrLoadModule(
          "@powerhousedao/connect/prerender",
        )) as ShellRenderer;
        // The stylesheet index.html links, which Tailwind builds for the shell's classes.
        const stylesheet = join(projectRoot, "style.css");
        const css = withHostStylesheet(
          readFileSync(stylesheet, "utf8"),
          stylesheet,
          hostStylesheet,
        );
        try {
          return await renderer.renderProjectShells(stylesheet, css);
        } catch (error) {
          throw withSourceLocations(error, (stack) =>
            server.ssrRewriteStacktrace(stack),
          );
        }
      },
    );
  } finally {
    await server.close();
  }
}

const RENDER_LOCATION = /\(at (\S+) \((.+?):(\d+):(\d+)\)\)/g;

/** The prerender's error with each `(at <component> (<file>:<line>:<col>))` in
 * its message mapped back to the source, as React reports the transformed code. */
export function withSourceLocations(
  error: unknown,
  rewrite: (stack: string) => string,
): unknown {
  if (!(error instanceof Error)) return error;
  const before = error.message;
  const after = before.replace(
    RENDER_LOCATION,
    (found, name, file, line, column) => {
      const frame = /^ {4}at .*?\(?(\S+?):(\d+):(\d+)\)?$/.exec(
        rewrite(`    at ${name} (${file}:${line}:${column})`),
      );
      return frame
        ? `(at ${name} (${frame[1]}:${frame[2]}:${frame[3]}))`
        : found;
    },
  );
  if (after !== before) {
    error.message = after;
    if (error.stack) error.stack = error.stack.replace(before, after);
  }
  return error;
}

/** Vite's error overlay over the page, for a failure no module request reports. */
export function withErrorOverlay(
  html: string,
  err: ErrorPayload["err"],
  base: string,
) {
  const payload = JSON.stringify(err).replaceAll("<", "\\u003c");
  const script = `<script type="module">import { ErrorOverlay } from "${base}@vite/client";document.body.appendChild(new ErrorOverlay(${payload}));</script>`;
  return html.replace("</body>", `${script}</body>`);
}

const sourceText = (source: string | Uint8Array) =>
  typeof source === "string" ? source : new TextDecoder().decode(source);

/** Build: the composition's shell in #root and every variant in the dist, from
 * the project's routes when it has them. Dev: the shell from the project's routes
 * when it has them, else core's for a core composition. */
export function connectAppShellPlugin(
  projectRoot: string,
  {
    composition,
    appName,
    routeAliases,
    routesDir,
    loader,
    hostStylesheet,
  }: ConnectAppShellOptions = {},
): Plugin {
  let variant: AppShellVariant = "generic";
  let shells: AppShells = {};
  let shellPlugins: ShellPlugins | undefined;
  let base = "/";
  let isBuild = true;
  let config: ResolvedConfig | undefined;
  // The project's loader in each shell's logo slot, under the deploy base.
  const withLoader = (from: AppShells): AppShells => {
    if (!loader) return from;
    const out: AppShells = {};
    for (const [name, shell] of Object.entries(from) as [
      AppShellVariant,
      AppShell,
    ][]) {
      out[name] = {
        ...shell,
        body: replaceShellLoader(shell.body, loader, base),
      };
    }
    return out;
  };
  // A project's shells go in the built index.html, so they're rendered after bundling.
  const fromRoutes = () => isBuild && !!routeAliases;
  const shell = () => {
    if (fromRoutes()) return undefined;
    return isBuild || variant === "core" ? shells[variant] : undefined;
  };
  // Dev with routes: the project's shells, rendered at start and on route edits.
  let devShells: Promise<AppShells> | undefined;
  let devRender: ReturnType<typeof setTimeout> | undefined;
  // The build fails on a shell that can't render, so dev shows it on the page.
  let devShellError: ErrorPayload["err"] | undefined;
  let devServer: ViteDevServer | undefined;
  const renderDevShells = () => {
    if (!config || !routeAliases) return;
    const logger = config.logger;
    // Not the last render's: a page loaded meanwhile gets a failure over the socket.
    devShellError = undefined;
    devShells = renderProjectAppShells(
      projectRoot,
      config,
      routeAliases,
      hostStylesheet,
    ).then(
      (rendered) => {
        devShellError = undefined;
        return withLoader(rendered);
      },
      (error: unknown) => {
        const cause = error instanceof Error ? error : new Error(String(error));
        devShellError = {
          message: `The loading shell failed to render from the project's routes, and the build will fail on it:\n${cause.message}`,
          stack: cause.stack ?? "",
          plugin: "ph-connect-app-shell",
        };
        logger.error(`[connect] ${devShellError.message}`, {
          timestamp: true,
        });
        devServer?.ws.send({ type: "error", err: devShellError });
        return {};
      },
    );
  };
  const devShell = async () => {
    if (!devShells) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), DEV_SHELL_WAIT_MS);
    });
    try {
      return (await Promise.race([devShells, wait]))?.[variant];
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    name: "ph-connect-app-shell",
    configureServer(server) {
      if (!routeAliases) return;
      devServer = server;
      renderDevShells();
      const stylesheet = join(projectRoot, "style.css");
      const rerender = (file: string) => {
        const changed =
          file === stylesheet ||
          file === hostStylesheet ||
          (!!routesDir && file.startsWith(`${routesDir}${sep}`));
        if (!changed) return;
        clearTimeout(devRender);
        devRender = setTimeout(renderDevShells, 300);
      };
      server.watcher.on("change", rerender);
      server.watcher.on("add", rerender);
      server.watcher.on("unlink", rerender);
    },
    configResolved(resolved) {
      config = resolved;
      base = resolved.base;
      isBuild = resolved.command === "build";
      shells = withLoader(readAppShells(projectRoot));
      shellPlugins = readShellPlugins(projectRoot);
      variant = appShellVariant(composition, shellPlugins);
    },
    transformIndexHtml: {
      // After Vite injects the built CSS links.
      order: "post",
      handler: async (html) => {
        // Never Connect's prebuilt shell for a project with its own layout.
        const current = !isBuild && routeAliases ? await devShell() : shell();
        // Dev keeps blocking CSS for HMR.
        const page = current
          ? injectAppShell(html, current, base, {
              deferStyles: isBuild,
              appName,
            })
          : html;
        return devShellError
          ? withErrorOverlay(page, devShellError, base)
          : page;
      },
    },
    generateBundle: {
      // After index.html and the CSS are in the bundle.
      order: "post",
      async handler(_options, bundle) {
        if (!isBuild) return;
        if (fromRoutes() && config && routeAliases) {
          shells = withLoader(
            await renderProjectAppShells(
              projectRoot,
              config,
              routeAliases,
              hostStylesheet,
            ),
          );
          const index = bundle["index.html"];
          const current = shells[variant];
          if (index?.type === "asset" && current) {
            index.source = injectAppShell(
              sourceText(index.source),
              current,
              base,
              { appName },
            );
          }
        }
        if (!Object.keys(shells).length) return;
        this.emitFile({
          type: "asset",
          fileName: APP_SHELLS_FILE,
          source: JSON.stringify(shells),
        });
        if (shellPlugins) {
          this.emitFile({
            type: "asset",
            fileName: SHELL_PLUGINS_FILE,
            source: JSON.stringify(shellPlugins),
          });
        }
      },
    },
  };
}
