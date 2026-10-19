import { Generator, getConfig } from "@tanstack/router-generator";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { layout, physical, rootRoute } from "@tanstack/virtual-file-routes";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Alias, Plugin, PluginOption } from "vite";
import { resolvePackage } from "../helpers.js";

/** A project's routes for its Connect deployment, beside Connect's own. */
export const HOST_ROUTES_DIR = "hosts/connect/routes";
/** The generated tree of Connect's and the project's routes. */
export const CONNECT_ROUTES_GEN = ".ph/connect-routes.gen.ts";
/** Connect's dist imports its route tree by this specifier. */
export const ROUTE_TREE_SPECIFIER = "@powerhousedao/connect/route-tree";

/** The project's routes folder, `hosts/connect/routes/`; undefined if none. */
export function resolveConnectRoutesDir(
  projectRoot: string,
): string | undefined {
  const dir = join(projectRoot, HOST_ROUTES_DIR);
  return existsSync(dir) ? dir : undefined;
}

/** Connect's pathless sidebar layout; a project's routes in `_app/` render in it. */
export const APP_LAYOUT = "_app";

function findRouteFile(dir: string, name: string) {
  return [".tsx", ".ts", ".jsx", ".js"]
    .map((ext) => join(dir, `${name}${ext}`))
    .find((file) => existsSync(file));
}

export type ConnectRoutes = {
  /** Points Connect at the tree to route with. */
  alias: Alias;
  /** The router plugin, only when the project has routes. */
  plugins: PluginOption[];
  /** Connect's route files and the project's share one router. */
  dedupe: string[];
};

/** The router plugin's config: Connect's root, its core routes and the project's. */
export function connectRoutesGeneratorConfig(
  connectDir: string,
  projectRoot: string,
  projectRoutes: string,
) {
  const routesDirectory = join(connectDir, "src/routes");
  const fromRoutes = (path: string) => relative(routesDirectory, path);
  // A project's _app.tsx replaces Connect's layout; its _app/ routes nest in it.
  const appLayout = findRouteFile(projectRoutes, APP_LAYOUT);
  const appRoutes = join(projectRoutes, APP_LAYOUT);
  return getConfig(
    {
      target: "react",
      routesDirectory,
      generatedRouteTree: join(projectRoot, CONNECT_ROUTES_GEN),
      virtualRouteConfig: rootRoute("__root.tsx", [
        layout(
          APP_LAYOUT,
          appLayout ? fromRoutes(appLayout) : `core/${APP_LAYOUT}.tsx`,
          [
            physical("", `core/${APP_LAYOUT}`),
            ...(existsSync(appRoutes)
              ? [physical("", fromRoutes(appRoutes))]
              : []),
          ],
        ),
        physical("", fromRoutes(projectRoutes)),
      ]),
      // The project's _app layout and folder are mounted above, not again at the root.
      routeFileIgnorePattern: `^${APP_LAYOUT}(\\.[cm]?[jt]sx?)?$`,
      quoteStyle: "double",
      semicolons: true,
      addExtensions: "js",
      autoCodeSplitting: true,
      disableLogging: true,
      routeTreeFileFooter: [
        'import type { ConnectRouterFor } from "@powerhousedao/connect/router";',
        'declare module "@tanstack/react-router" {',
        "  interface Register {",
        "    router: ConnectRouterFor<typeof routeTree>;",
        "  }",
        "}",
      ],
    },
    projectRoot,
  );
}

/** Writes the route tree of Connect's and the project's routes; throws on a
 * collision with a core route, which the router plugin would only log. */
export async function generateConnectRoutes(
  projectRoot: string,
  routesDir: string,
  config = connectRoutesGeneratorConfig(
    connectDirOf(projectRoot),
    projectRoot,
    routesDir,
  ),
) {
  mkdirSync(dirname(config.generatedRouteTree), { recursive: true });
  try {
    await new Generator({ config, root: projectRoot }).run();
    assertNoDuplicateRoutes(config.generatedRouteTree);
    importCoreRoutesByPackage(
      config.generatedRouteTree,
      config.routesDirectory,
    );
  } catch (error) {
    const errors: unknown[] = Array.isArray(error) ? error : [error];
    const message = errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .join("\n");
    const shown = relative(projectRoot, routesDir).split(sep).join("/");
    throw new Error(
      `Connect could not mount the routes in ${shown}/:\n${message}`,
      { cause: error },
    );
  }
}

/** Connect's route files, as the generated tree imports them. */
export const CONNECT_ROUTES_SPECIFIER = "@powerhousedao/connect/routes";

// By package name, Connect's route files are a library to tsc: no rootDir error
// and no declarations emitted for them. Vite resolves either form.
function importCoreRoutesByPackage(treeFile: string, routesDirectory: string) {
  const relativeDir = relative(dirname(treeFile), routesDirectory);
  const prefix = `"./${relativeDir.split(sep).join("/")}/`;
  const tree = readFileSync(treeFile, "utf8");
  const rewritten = tree.replace(
    new RegExp(`${escapeRegExp(prefix)}([^"]+)\\.js"`, "g"),
    `"${CONNECT_ROUTES_SPECIFIER}/$1"`,
  );
  if (rewritten !== tree) writeFileSync(treeFile, rewritten);
}

// The plugin checks only leaf routes; a layout twice, e.g. settings.tsx, shows as one import name twice.
function assertNoDuplicateRoutes(treeFile: string) {
  const tree = readFileSync(treeFile, "utf8");
  const files = new Map<string, string[]>();
  for (const [, name, file] of tree.matchAll(
    /^import \{ Route as (\w+) \} from "([^"]+)";$/gm,
  )) {
    files.set(name, [...(files.get(name) ?? []), file]);
  }
  const conflicts = [...files.values()].filter((list) => list.length > 1);
  if (conflicts.length === 0) return;
  throw new Error(
    `Conflicting configuration paths were found for a layout route.\nConflicting files: \n ${conflicts.flat().join("\n ")}\n`,
  );
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Generates the tree when the project has routes, else drops a stale one. */
export async function syncConnectRoutes(
  projectRoot: string,
  routesDir = resolveConnectRoutesDir(projectRoot),
) {
  if (routesDir) {
    await generateConnectRoutes(projectRoot, routesDir);
  } else {
    rmSync(join(projectRoot, CONNECT_ROUTES_GEN), { force: true });
  }
}

function connectDirOf(projectRoot: string) {
  return dirname(
    resolvePackage("@powerhousedao/connect/package.json", projectRoot),
  );
}

/** Mounts a project's routes folder beside Connect's core routes; without one,
 * Connect keeps its prebuilt core tree and no router plugin runs. */
export function connectRoutes(
  projectRoot: string,
  routesDir = resolveConnectRoutesDir(projectRoot),
): ConnectRoutes {
  const connectDir = connectDirOf(projectRoot);
  const find = new RegExp(`^${ROUTE_TREE_SPECIFIER}$`);
  if (!routesDir) {
    rmSync(join(projectRoot, CONNECT_ROUTES_GEN), { force: true });
    return {
      alias: { find, replacement: join(connectDir, "dist/route-tree.js") },
      plugins: [],
      dedupe: [],
    };
  }
  const config = connectRoutesGeneratorConfig(
    connectDir,
    projectRoot,
    routesDir,
  );
  mkdirSync(dirname(config.generatedRouteTree), { recursive: true });
  const check: Plugin = {
    name: "ph-connect-routes-check",
    buildStart: () => generateConnectRoutes(projectRoot, routesDir, config),
  };
  return {
    alias: { find, replacement: config.generatedRouteTree },
    plugins: [
      check,
      // Before react(): it splits route files ahead of the JSX transform.
      tanstackRouter(config),
    ],
    dedupe: ["@tanstack/react-router"],
  };
}

const ROUTER_PACKAGES =
  /[\\/]node_modules[\\/]@tanstack[\\/](react-router|router-core|history|react-store|store)[\\/]/;

/** One chunk for the router and the project's route configs, which the split
 * route components would otherwise spread over several shared chunks. */
export function connectRouterChunkGroups(routesDir?: string) {
  const routes = routesDir && join(routesDir, sep);
  return [
    // Its own chunk: the entry imports it, and must not load the router with it.
    { name: "preload-helper", test: /vite[\\/]preload-helper/, priority: 1 },
    // Shared with non-router libraries, which must not load the router for it.
    {
      name: "use-sync-external-store",
      test: /[\\/]node_modules[\\/]use-sync-external-store[\\/]/,
      priority: 1,
    },
    {
      name: "router",
      test: (id: string) =>
        ROUTER_PACKAGES.test(id) ||
        (!!routes && id.startsWith(routes) && !id.includes("tsr-split")),
    },
  ];
}
