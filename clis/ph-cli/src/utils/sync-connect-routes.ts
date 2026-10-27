import { existsSync } from "node:fs";
import { join } from "node:path";

// builder-tools' PACKAGE_ROUTES_MODULE and HOST_ROUTES_DIR, without loading it
// for packages with no routes.
export const OFFERED_ROUTES_MODULE = ".ph/connect-routes.package.ts";
export const HOST_ROUTES_DIR = "hosts/connect/routes";
const CONNECT_ROUTES_GEN = ".ph/connect-routes.gen.ts";

/** Writes the tree hosts/connect/routes/ type-checks against; without the
 * folder, a tree there keeps Connect's routes only. Loads builder-tools only
 * for a project with routes or a tree. */
export async function syncProjectConnectRoutes(projectRoot: string) {
  const probes = [HOST_ROUTES_DIR, CONNECT_ROUTES_GEN, OFFERED_ROUTES_MODULE];
  if (!probes.some((p) => existsSync(join(projectRoot, p)))) return;
  const { resolveConnectRoutesDir, syncConnectRoutes } =
    await import("@powerhousedao/builder-tools");
  await syncConnectRoutes(projectRoot, resolveConnectRoutesDir(projectRoot));
}
