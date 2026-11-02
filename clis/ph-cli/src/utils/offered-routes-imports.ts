import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "rolldown";
import {
  HOST_ROUTES_DIR,
  OFFERED_ROUTES_MODULE,
} from "./sync-connect-routes.js";

const CONNECT_IMPORT = /^@powerhousedao\/connect(\/|$)/;

const GUARD = "ph-offered-routes-imports";

export const CONNECT_IMPORT_HINT =
  "Routes a package offers other Connects import @powerhousedao/connect-core instead (ContentOutlet, ModalDialog, useConnectChrome, useDriveRouteData, useNavRoutes and useSidebarMode from @powerhousedao/connect-core/router, SidebarItem from @powerhousedao/design-system/connect); only its own host's _app.tsx and overrides may use @powerhousedao/connect.";

type ModuleGraph = {
  getModuleInfo(id: string): {
    importedIds: readonly string[];
    dynamicallyImportedIds: readonly string[];
  } | null;
  error(message: string): never;
};

function reachableFrom(graph: ModuleGraph, entry: string) {
  const reached = new Set<string>();
  const pending = [entry];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (reached.has(id)) continue;
    reached.add(id);
    const info = graph.getModuleInfo(id);
    if (info) pending.push(...info.importedIds, ...info.dynamicallyImportedIds);
  }
  return reached;
}

/** Fails the build on an import of Connect that the offered routes reach, as
 * other Connects don't share Connect with the package; warns on one from the
 * rest of the package, which bundles a copy of the Connect modules it uses. */
export function noConnectImports(routesEntry: string, routesDir: string) {
  const imports = new Map<string, Set<string>>();
  // Module ids may spell a Windows path with either separator.
  const slash = (path: string) => path.replaceAll("\\", "/");
  const isRoute = (id: string) =>
    slash(id) === slash(routesEntry) ||
    slash(id).startsWith(`${slash(routesDir)}/`);
  return {
    name: GUARD,
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !CONNECT_IMPORT.test(source)) return null;
      // Before resolving it: a route file's import fails even unresolved.
      if (isRoute(importer)) {
        throw new Error(
          `${importer} imports "${source}". ${CONNECT_IMPORT_HINT}`,
        );
      }
      const sources = imports.get(importer) ?? new Set<string>();
      imports.set(importer, sources.add(source));
      return null;
    },
    buildEnd(this: ModuleGraph, error?: Error) {
      if (error || !imports.size) return;
      const entry = this.getModuleInfo(routesEntry)
        ? routesEntry
        : slash(routesEntry);
      const reached = reachableFrom(this, entry);
      const described = ([importer, sources]: [string, Set<string>]) =>
        `${importer} imports ${[...sources].map((s) => `"${s}"`).join(", ")}`;
      const offered = [...imports].filter(([id]) => reached.has(id));
      if (offered.length) {
        this.error(
          `${offered.map(described).join("\n")}\n${CONNECT_IMPORT_HINT}`,
        );
      }
      console.warn(
        `⚠ ${[...imports].map(described).join("\n")}\nConnect isn't shared with the packages it loads, so the build bundles a copy of these modules, apart from the app's state. Import @powerhousedao/connect-core instead; a later version fails the build.`,
      );
    },
  };
}

type PluginError = Error & { plugin?: string };

const IN_NODE_MODULES = /[\\/]node_modules[\\/]/;
const SCRIPT = /\.[cm]?[jt]sx?$/;

// The project's own modules only: dependencies, styles and assets stay out.
const projectModulesOnly: Plugin = {
  name: "ph-offered-routes-project-modules",
  async resolveId(source, importer, options) {
    if (!importer) return null;
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    if (!resolved || resolved.external) return { id: source, external: true };
    if (IN_NODE_MODULES.test(resolved.id) || !SCRIPT.test(resolved.id)) {
      return { id: resolved.id, external: true };
    }
    return resolved;
  },
};

/** Fails as `ph build` does when the routes the package offers reach an
 * import of Connect; bundles the project's modules in memory, writing nothing. */
export async function checkOfferedRoutesImports(projectDir: string) {
  // Module ids are real paths; the routes are matched against them.
  const projectRoot = realpathSync(projectDir);
  const entry = join(projectRoot, OFFERED_ROUTES_MODULE);
  if (!existsSync(entry)) return;
  const { rolldown } = await import("rolldown");
  const bundle = await rolldown({
    input: entry,
    cwd: projectRoot,
    tsconfig: true,
    logLevel: "silent",
    plugins: [
      noConnectImports(entry, join(projectRoot, HOST_ROUTES_DIR)),
      projectModulesOnly,
    ],
  });
  try {
    // Rolldown resolves the graph on generate.
    await bundle.generate({});
  } catch (error) {
    // Only the import rule fails here; tsc and lint report a file that won't parse.
    const found = ((error as { errors?: PluginError[] }).errors ?? []).filter(
      (e) => e.plugin === GUARD,
    );
    if (found.length) {
      throw new Error(found.map((e) => e.message).join("\n"), {
        cause: error,
      });
    }
  } finally {
    await bundle.close();
  }
}
