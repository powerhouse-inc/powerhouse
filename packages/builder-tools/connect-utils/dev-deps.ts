import type { DepOptimizationOptions } from "vite";

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
  };
}
