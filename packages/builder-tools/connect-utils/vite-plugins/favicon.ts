import { readFileSync } from "node:fs";
import type { Connect, Plugin } from "vite";

/**
 * Vite plugin to serve the Connect favicon (icon.ico) from the connect package.
 * This ensures the favicon is available in development and included in the production build.
 */
export function connectFaviconPlugin(): Plugin {
  return {
    name: "copy-connect-favicon",
    configureServer(server) {
      // Vite rewrites the favicon link against `base`, so serve the
      // base-prefixed path. Keep the bare path for robustness.
      const base = server.config.base;
      const faviconPath = `${base}icon.ico`.replace(/\/{2,}/g, "/");
      const handler: Connect.NextHandleFunction = (_req, res, next) => {
        server.pluginContainer
          .resolveId("@powerhousedao/connect/assets/icon.ico")
          .then((resolved) => {
            if (!resolved) return next();
            res.setHeader("Content-Type", "image/x-icon");
            res.end(readFileSync(resolved.id));
          })
          .catch(() => next());
      };
      // Mount on the exact route(s) so the handler only runs for icon.ico.
      // Connect strips the mount prefix before matching, so mounting on
      // "/icon.ico" matches that path exactly.
      const paths = new Set([faviconPath, "/icon.ico"]);
      for (const path of paths) {
        server.middlewares.use(path, handler);
      }
    },
    async generateBundle(_options, bundle) {
      try {
        if ("icon.ico" in bundle) return;
        const resolved = await this.resolve(
          "@powerhousedao/connect/assets/icon.ico",
        );
        if (!resolved) return;
        this.emitFile({
          type: "asset",
          fileName: "icon.ico",
          source: readFileSync(resolved.id),
        });
      } catch {
        // connect package not found, skip favicon
      }
    },
  };
}
