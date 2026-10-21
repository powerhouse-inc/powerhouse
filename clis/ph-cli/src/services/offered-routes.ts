import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// builder-tools' PACKAGE_ROUTES_MODULE and HOST_ROUTES_DIR, without loading it
// for packages with no routes.
export const OFFERED_ROUTES_MODULE = ".ph/connect-routes.package.ts";
export const HOST_ROUTES_DIR = "hosts/connect/routes";

// The manifest with `connectRoutes` set when the package offers routes; as it
// is, byte for byte, when the flag is already right.
function withOfferedRoutes(json: string, offers: boolean) {
  const manifest = JSON.parse(json) as { connectRoutes?: boolean };
  if (offers ? manifest.connectRoutes === true : !("connectRoutes" in manifest))
    return json;
  if (offers) manifest.connectRoutes = true;
  else delete manifest.connectRoutes;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const slashes = (path: string) => path.replaceAll("\\", "/");

/** Sets `connectRoutes` in the manifest the package's root module imports,
 * leaving the project's file as it is. */
export function offeredRoutesManifest(projectRoot: string, offers: boolean) {
  // Vite's ids use forward slashes on Windows too.
  const manifestPath = slashes(join(projectRoot, "powerhouse.manifest.json"));
  return {
    name: "ph-offered-routes-manifest",
    transform(code: string, id: string) {
      if (slashes(id) !== manifestPath) return null;
      return { code: withOfferedRoutes(code, offers), map: null };
    },
  };
}

/** Sets `connectRoutes` in the dist copy of the manifest. */
export function markOfferedRoutes(dir: string, offers: boolean) {
  const manifestPath = join(dir, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;
  const json = readFileSync(manifestPath, "utf-8");
  writeFileSync(manifestPath, withOfferedRoutes(json, offers));
}

const CONNECT_IMPORT = /^@powerhousedao\/connect(\/|$)/;

const CONNECT_IMPORT_HINT =
  "Routes a package offers other Connects import @powerhousedao/connect-core instead (ContentOutlet, ModalDialog, RouteSelection, useDriveRouteData, useNavRoutes and useSidebarMode from @powerhousedao/connect-core/router, SidebarItem from @powerhousedao/design-system/connect); only its own host's _app.tsx and overrides may use @powerhousedao/connect.";

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
    name: "ph-offered-routes-imports",
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
