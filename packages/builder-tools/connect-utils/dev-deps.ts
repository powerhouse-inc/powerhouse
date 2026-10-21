import type { DepOptimizationOptions } from "vite";
import {
  CORE_ROUTE_TREE_SPECIFIER,
  ROUTE_TREE_SPECIFIER,
} from "./vite-plugins/connect-routes.js";

/** Pre-bundled deps for Connect's dev server; see connectRouteFileDeps. */
export function connectOptimizeDeps(
  routeFileDeps: string[],
): DepOptimizationOptions {
  return {
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
