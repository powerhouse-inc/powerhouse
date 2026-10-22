import { Generator, getConfig } from "@tanstack/router-generator";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import type { GeneratorPlugin } from "@tanstack/router-generator";
import type { VirtualRouteNode } from "@tanstack/virtual-file-routes";
import {
  index,
  layout,
  physical,
  rootRoute,
  route,
} from "@tanstack/virtual-file-routes";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Alias, Plugin, PluginOption } from "vite";
import { normalizePath } from "vite";
import { resolvePackage } from "../helpers.js";

/** A project's routes for its Connect deployment, beside Connect's own. */
export const HOST_ROUTES_DIR = "hosts/connect/routes";
/** The generated tree of Connect's and the project's routes. */
export const CONNECT_ROUTES_GEN = ".ph/connect-routes.gen.ts";
/** Connect's dist imports its route tree by this specifier. */
export const ROUTE_TREE_SPECIFIER = "@powerhousedao/connect/route-tree";
/** Core's types name the app's tree by this one; both resolve to one tree. */
export const CORE_ROUTE_TREE_SPECIFIER =
  "@powerhousedao/connect-core/route-tree";

const ROUTE_TREE_FIND = new RegExp(
  `^(${[ROUTE_TREE_SPECIFIER, CORE_ROUTE_TREE_SPECIFIER].map(escapeRegExp).join("|")})$`,
);

/** A host's routes folder: `routes` (a host's `runner.routes`), relative to the
 * project, else `hosts/connect/routes/`; undefined if none or `false`. */
export function resolveConnectRoutesDir(
  projectRoot: string,
  routes?: string | false,
): string | undefined {
  if (routes === false) return undefined;
  if (routes !== undefined) {
    const dir = resolve(projectRoot, routes);
    if (!existsSync(dir)) {
      throw new Error(`The routes folder ${routes} does not exist.`);
    }
    return dir;
  }
  const dir = join(projectRoot, HOST_ROUTES_DIR);
  return existsSync(dir) ? dir : undefined;
}

const isDefaultRoutesDir = (projectRoot: string, routesDir: string) =>
  resolve(routesDir) === join(resolve(projectRoot), HOST_ROUTES_DIR);

/** The tree generated from `routesDir`: `.ph/connect-routes.gen.ts` for
 * `hosts/connect/routes/`, else `.ph/<folder>.gen.ts`. */
export function connectRoutesTreeOf(projectRoot: string, routesDir: string) {
  if (isDefaultRoutesDir(projectRoot, routesDir)) {
    return join(projectRoot, CONNECT_ROUTES_GEN);
  }
  return join(projectRoot, ".ph", `${relative(projectRoot, routesDir)}.gen.ts`);
}

/** The dev watcher's filter for `.ph/`, which holds build output: ignored but
 * for the host's route tree, rewritten as route files come and go. */
export function ignoreDotPhButRouteTree(
  projectRoot: string,
  routesDir?: string | false,
) {
  const tree =
    routesDir && normalizePath(connectRoutesTreeOf(projectRoot, routesDir));
  return (file: string) => {
    const path = normalizePath(resolve(projectRoot, file));
    if (!path.includes("/.ph/")) return false;
    // The tree and the folders that lead to it stay watched.
    return !tree || (path !== tree && !tree.startsWith(`${path}/`));
  };
}

/** Connect's pathless sidebar layout; a project's routes in `_app/` render in it. */
export const APP_LAYOUT = "_app";

function findRouteFile(dir: string, name: string) {
  return [".tsx", ".ts", ".jsx", ".js"]
    .map((ext) => join(dir, `${name}${ext}`))
    .find((file) => existsSync(file));
}

export type ConnectRoutes = {
  /** Points Connect at the tree to route with, then at what its route files render. */
  aliases: Alias[];
  /** The router plugin, only when the project has routes. */
  plugins: PluginOption[];
  /** Connect's route files and the project's share one router. */
  dedupe: string[];
  /** Pre-bundled for Connect's route files; see connectRouteFileDeps. */
  include: string[];
};

/** Connect's route files: core's routes with Connect's views. */
export function connectRoutesDirOf(connectDir: string) {
  return join(connectDir, "src/routes");
}

const ROUTE_FILE = /\.[cm]?[jt]sx?$/;

// Not routes: dotfiles and the generator's routeFileIgnorePrefix.
const isRouteEntry = (name: string) =>
  !name.startsWith(".") && !name.startsWith("-");

/** The route files under `dir`, by path relative to it. */
function routeFilesIn(dir: string, at = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(join(dir, at), { withFileTypes: true })
    .filter((entry) => isRouteEntry(entry.name))
    .flatMap((entry) => {
      const path = at ? `${at}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return routeFilesIn(dir, path);
      return ROUTE_FILE.test(entry.name) ? [path] : [];
    });
}

/** A route file's id below its folder: route groups and `route` files
 * resolved, flat `a.b` names read as folders. */
export function routeIdOf(file: string) {
  const segments = file
    .replace(ROUTE_FILE, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment));
  if (segments.at(-1) === "route") segments.pop();
  return segments.join("/").replaceAll(".", "/");
}

/** Connect's `_app/` route files that a project file at the same id replaces. */
export function overriddenConnectRoutes(
  connectAppDir: string,
  projectAppDir: string,
) {
  const projectIds = new Set(routeFilesIn(projectAppDir).map(routeIdOf));
  return new Set(
    routeFilesIn(connectAppDir).filter((file) =>
      projectIds.has(routeIdOf(file)),
    ),
  );
}

const stemOf = (name: string) => name.replace(ROUTE_FILE, "");

/** Mounts Connect's routes in `dir` without the `overridden` files: a folder
 * whole when none is in it, else file by file. */
function mountConnectRoutes(
  routesDirectory: string,
  dir: string,
  overridden: ReadonlySet<string>,
  prefix = "",
): VirtualRouteNode[] {
  if (![...overridden].some((file) => file.startsWith(`${dir}/`))) {
    return [physical(prefix, dir)];
  }
  const entries = readdirSync(join(routesDirectory, dir), {
    withFileTypes: true,
  }).filter((entry) => isRouteEntry(entry.name));
  const files = entries
    .filter((entry) => entry.isFile() && ROUTE_FILE.test(entry.name))
    .map((entry) => entry.name);
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const at = (name: string) => (prefix ? `${prefix}/${name}` : name);
  const nodes: VirtualRouteNode[] = [];
  for (const name of files) {
    const file = `${dir}/${name}`;
    const stem = stemOf(name);
    const folder = folders.includes(stem) ? `${dir}/${stem}` : undefined;
    if (overridden.has(file)) {
      // Its child routes nest in the project's file, which has the same path.
      if (folder) nodes.push(physical(at(stem), folder));
      continue;
    }
    const children =
      folder && mountConnectRoutes(routesDirectory, folder, overridden);
    if (stem === "index") {
      nodes.push(prefix ? route(`${prefix}/`, file) : index(file));
    } else if (!prefix && stem.startsWith("_")) {
      nodes.push(layout(stem, file, children || []));
    } else {
      nodes.push(
        children ? route(at(stem), file, children) : route(at(stem), file),
      );
    }
  }
  // A folder without a route file of its own only adds to its routes' paths.
  for (const name of folders) {
    if (files.some((file) => stemOf(file) === name)) continue;
    nodes.push(
      ...mountConnectRoutes(
        routesDirectory,
        `${dir}/${name}`,
        overridden,
        at(name),
      ),
    );
  }
  return nodes;
}

/** The routes a package offers other Connects, as `ph build` publishes them
 * (`./connect-routes`); generated beside the route tree. */
export const PACKAGE_ROUTES_MODULE = ".ph/connect-routes.package.ts";

type RouteNodes = Parameters<
  NonNullable<GeneratorPlugin["onRouteTreeChanged"]>
>[0]["routeNodes"];

/** Writes the package's routes for registerPackageRoutes: its files but its
 * `_app` layout and its overrides of Connect's `_app/` routes, parents first. */
function writePackageRoutesModule(
  projectRoot: string,
  projectRoutes: string,
  routeNodes: RouteNodes,
  options: { routesDirectory: string; connectAppIds: ReadonlySet<string> },
) {
  const module = join(projectRoot, PACKAGE_ROUTES_MODULE);
  const appDir = join(projectRoutes, APP_LAYOUT);
  const offered = routeNodes
    .map((node) => ({
      node,
      file: join(options.routesDirectory, node.filePath),
    }))
    .filter(({ node, file }) => {
      if (!file.startsWith(`${projectRoutes}${sep}`)) return false;
      if (node.routePath === `/${APP_LAYOUT}`) return false;
      if (!file.startsWith(`${appDir}${sep}`)) return true;
      const id = routeIdOf(relative(appDir, file).split(sep).join("/"));
      return !options.connectAppIds.has(id);
    })
    .sort(
      (a, b) =>
        (a.node.routePath ?? "").split("/").length -
        (b.node.routePath ?? "").split("/").length,
    );
  if (offered.length === 0) {
    rmSync(module, { force: true });
    return;
  }
  const from = (file: string) => {
    const path = relative(dirname(module), file).split(sep).join("/");
    return path.replace(ROUTE_FILE, ".js");
  };
  const lines = [
    "// Generated by ph build: the routes this package offers other Connects.",
    'import type { PackageRoute } from "@powerhousedao/connect-core/router";',
    ...offered.map(
      ({ file }, i) => `import { Route as r${i} } from "${from(file)}";`,
    ),
    "",
    "export const connectRoutes: PackageRoute[] = [",
    ...offered.map(({ node }, i) => {
      const pathless = node._fsRouteType === "pathless_layout";
      const entry = {
        id: node.routePath,
        ...(pathless ? {} : { path: node.path }),
        parentId: node.parent?.routePath ?? "__root__",
      };
      const fields = Object.entries(entry)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(", ");
      return `  { route: r${i}, ${fields} },`;
    }),
    "];",
    "",
  ];
  mkdirSync(dirname(module), { recursive: true });
  const text = lines.join("\n");
  if (!existsSync(module) || readFileSync(module, "utf8") !== text) {
    writeFileSync(module, text);
  }
}

/** The router plugin's config: Connect's root and routes, and the project's. */
export function connectRoutesGeneratorConfig(
  connectDir: string,
  projectRoot: string,
  projectRoutes: string,
) {
  const routesDirectory = connectRoutesDirOf(connectDir);
  const fromRoutes = (path: string) => relative(routesDirectory, path);
  // Read on every generation, so dev sees an override added or removed.
  const virtualRouteConfig = () => {
    // A project's _app.tsx replaces Connect's layout; its _app/ routes nest in it.
    const appLayout = findRouteFile(projectRoutes, APP_LAYOUT);
    const appRoutes = join(projectRoutes, APP_LAYOUT);
    const overridden = new Set(
      [
        ...overriddenConnectRoutes(
          join(routesDirectory, APP_LAYOUT),
          appRoutes,
        ),
      ].map((file) => `${APP_LAYOUT}/${file}`),
    );
    return rootRoute("__root.tsx", [
      layout(
        APP_LAYOUT,
        appLayout ? fromRoutes(appLayout) : `${APP_LAYOUT}.tsx`,
        [
          ...mountConnectRoutes(routesDirectory, APP_LAYOUT, overridden),
          ...(existsSync(appRoutes)
            ? [physical("", fromRoutes(appRoutes))]
            : []),
        ],
      ),
      physical("", fromRoutes(projectRoutes)),
    ]);
  };
  // The router plugin parses a copy of its config; this reaches its generator's.
  const overrides: GeneratorPlugin = {
    name: "ph-connect-route-overrides",
    init: ({ generator }) => {
      Object.defineProperty(generator.config, "virtualRouteConfig", {
        get: virtualRouteConfig,
        configurable: true,
        enumerable: true,
      });
    },
  };
  // Only hosts/connect/routes/ is offered to other Connects; a host's own folder is not.
  const offers = isDefaultRoutesDir(projectRoot, projectRoutes);
  const offered: GeneratorPlugin = {
    name: "ph-connect-offered-routes",
    onRouteTreeChanged: ({ routeNodes }) => {
      writePackageRoutesModule(projectRoot, projectRoutes, routeNodes, {
        routesDirectory,
        connectAppIds: new Set(
          routeFilesIn(join(routesDirectory, APP_LAYOUT)).map(routeIdOf),
        ),
      });
    },
  };
  return getConfig(
    {
      target: "react",
      routesDirectory,
      generatedRouteTree: connectRoutesTreeOf(projectRoot, projectRoutes),
      virtualRouteConfig: virtualRouteConfig(),
      plugins: offers ? [overrides, offered] : [overrides],
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
 * collision that is not an override, which the router plugin would only log. */
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
    importConnectRoutesByPackage(
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

/** Connect's route files, as the generated tree imports them: by Connect's
 * package name, which a project depends on. */
export const CONNECT_ROUTES_SPECIFIER = "@powerhousedao/connect/routes";

// By package name, Connect's route files are a library to tsc: no rootDir error
// and no declarations emitted for them. Vite resolves either form.
function importConnectRoutesByPackage(
  treeFile: string,
  routesDirectory: string,
) {
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
    rmSync(join(projectRoot, PACKAGE_ROUTES_MODULE), { force: true });
  }
}

function connectDirOf(projectRoot: string) {
  return dirname(
    resolvePackage("@powerhousedao/connect/package.json", projectRoot),
  );
}

/** What Connect's route files import, besides each other. */
export const CONNECT_ROUTE_FILE_DEPS = [
  "@tanstack/react-router",
  "@powerhousedao/connect-core/router",
  "@powerhousedao/connect/route-views",
];

const IN_NODE_MODULES = /[\\/]node_modules[\\/]/;

/**
 * The `optimizeDeps.include` entries an installed Connect's route files need.
 *
 * Connect and core ship their route files as `.tsx`, which Vite never
 * pre-bundles, so the dev server serves them as they are. Vite also discovers
 * no dependency for a module inside node_modules, so their bare imports load
 * unbundled too, and the CommonJS packages under the router
 * (use-sync-external-store, safe-stable-stringify) then fail in the browser.
 * Pre-bundling these by Connect's name gives the route files the copies they
 * resolve to; core need not be resolvable from the project. A Connect outside
 * node_modules (the monorepo, a linked checkout) is source to Vite, so its
 * imports are discovered and pre-bundled anyway.
 */
export function connectRouteFileDeps(connectDir: string): string[] {
  if (!IN_NODE_MODULES.test(connectDir)) return [];
  return CONNECT_ROUTE_FILE_DEPS.map(
    (dep) => `@powerhousedao/connect > ${dep}`,
  );
}

/** Mounts a project's routes folder over Connect's routes; without one,
 * Connect keeps its prebuilt tree and no router plugin runs. */
export function connectRoutes(
  projectRoot: string,
  routesDir: string | false | undefined = resolveConnectRoutesDir(projectRoot),
): ConnectRoutes {
  const connectDir = connectDirOf(projectRoot);
  const find = ROUTE_TREE_FIND;
  const include = connectRouteFileDeps(connectDir);
  if (!routesDir) {
    // Stale only without hosts/connect/routes/: a routeless host keeps the project's tree.
    if (!resolveConnectRoutesDir(projectRoot)) {
      rmSync(join(projectRoot, CONNECT_ROUTES_GEN), { force: true });
    }
    // Connect's prebuilt tree, for core's types' specifier too.
    return {
      aliases: [{ find, replacement: join(connectDir, "dist/route-tree.js") }],
      plugins: [],
      dedupe: [],
      include,
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
    aliases: [
      { find, replacement: config.generatedRouteTree },
      // Connect's route files compile in the project's build; their views are
      // Connect's dist, not the sources its tsconfig paths name in the monorepo.
      {
        find: /^@powerhousedao\/connect\/route-views$/,
        replacement: join(connectDir, "dist/route-views.js"),
      },
    ],
    plugins: [
      check,
      // Before react(): it splits route files ahead of the JSX transform.
      tanstackRouter(config),
    ],
    dedupe: ["@tanstack/react-router"],
    include,
  };
}

const ROUTER_PACKAGES =
  /[\\/]node_modules[\\/]@tanstack[\\/](react-router|router-core|history|react-store|store)[\\/]/;

/** One chunk for the router and the project's route configs, which the split
 * route components would otherwise spread over several shared chunks. */
export function connectRouterChunkGroups(routesDir?: string | false) {
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
