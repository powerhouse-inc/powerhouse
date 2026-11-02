import { relative, sep } from "node:path";
import type { DepOptimizationOptions } from "vite";
import {
  CORE_ROUTE_TREE_SPECIFIER,
  ROUTE_TREE_SPECIFIER,
} from "./vite-plugins/connect-routes.js";

/** The outermost node_modules in a package's real path; null outside one. */
export function dependencyStoreOf(realPath: string): string | null {
  const parts = realPath.split(sep);
  const at = parts.indexOf("node_modules");
  return at > 0 ? parts.slice(0, at + 1).join(sep) : null;
}

/** Pre-bundled deps for Connect's dev server, scanning the project's routes. */
export function connectOptimizeDeps(
  projectRoot: string,
  routesDir: string | false | undefined,
  routeFileDeps: string[],
): DepOptimizationOptions {
  const routes =
    routesDir && relative(projectRoot, routesDir).replaceAll("\\", "/");
  return {
    // Behind the external tree, the scan misses the routes' imports, and the
    // first visit re-bundles and reloads; index.html stays the main entry.
    ...(routes
      ? { entries: ["index.html", `${routes}/**/*.{js,jsx,ts,tsx}`] }
      : {}),
    include: [
      "document-model",
      "zod",
      "@powerhousedao/design-system/connect",
      "@powerhousedao/reactor-browser",
      "@powerhousedao/document-engineering",
      ...routeFileDeps,
    ],
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite-tools"],
    // The tree is the project's routes: bundled into Connect's dep, edits and
    // HMR would never reach them, and they'd load a second router.
    rolldownOptions: {
      external: [ROUTE_TREE_SPECIFIER, CORE_ROUTE_TREE_SPECIFIER],
    },
  };
}
