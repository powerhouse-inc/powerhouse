import { readFileSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import type { Connect, Plugin } from "vite";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/**
 * Vite plugin to serve the Connect favicon (icon.ico) from the connect package,
 * or from a caller-supplied file when `faviconPath` is set (e.g. `ph connect
 * build --favicon`). An .svg or .png keeps its type as icon.svg or icon.png,
 * and index.html's `<link rel="icon">` is rewritten to it; browsers decode a
 * file named icon.ico as an ICO.
 */
export function connectFaviconPlugin(
  opts: { faviconPath?: string } = {},
): Plugin {
  // Build input, not runtime config: a non-absolute path resolves against the
  // build cwd (= the project dir during `ph connect build`).
  const customPath = opts.faviconPath
    ? isAbsolute(opts.faviconPath)
      ? opts.faviconPath
      : resolve(process.cwd(), opts.faviconPath)
    : undefined;
  const ext = customPath ? extname(customPath).toLowerCase() : ".ico";
  const customContentType = CONTENT_TYPE_BY_EXT[ext] ?? "image/x-icon";
  const fileName = ext === ".svg" || ext === ".png" ? `icon${ext}` : "icon.ico";

  return {
    name: "copy-connect-favicon",
    configureServer(server) {
      // Vite rewrites the favicon link against `base`, so serve the
      // base-prefixed path. Keep the bare path for robustness.
      const base = server.config.base;
      const route = (name: string) => `${base}${name}`.replace(/\/{2,}/g, "/");
      const handler: Connect.NextHandleFunction = (_req, res, next) => {
        if (customPath) {
          try {
            res.setHeader("Content-Type", customContentType);
            res.end(readFileSync(customPath));
          } catch {
            next();
          }
          return;
        }
        server.pluginContainer
          .resolveId("@powerhousedao/connect/assets/icon.ico")
          .then((resolved) => {
            if (!resolved) return next();
            res.setHeader("Content-Type", "image/x-icon");
            res.end(readFileSync(resolved.id));
          })
          .catch(() => next());
      };
      // Mount on the exact route(s) so the handler only runs for the icon.
      // Connect strips the mount prefix before matching, so mounting on
      // "/icon.ico" matches that path exactly.
      const paths = new Set([
        route(fileName),
        `/${fileName}`,
        route("icon.ico"),
        "/icon.ico",
      ]);
      for (const path of paths) {
        server.middlewares.use(path, handler);
      }
    },
    transformIndexHtml(html) {
      if (fileName === "icon.ico") return html;
      return html.replace(
        /<link rel="icon" href="([^"]*)icon\.ico"\s*\/?>/,
        `<link rel="icon" type="${customContentType}" href="$1${fileName}" />`,
      );
    },
    async generateBundle(_options, bundle) {
      try {
        if (fileName in bundle) return;
        let source: Uint8Array | undefined;
        if (customPath) {
          source = readFileSync(customPath);
        } else {
          const resolved = await this.resolve(
            "@powerhousedao/connect/assets/icon.ico",
          );
          if (resolved) source = readFileSync(resolved.id);
        }
        if (!source) return;
        this.emitFile({
          type: "asset",
          fileName,
          source,
        });
      } catch {
        // favicon source not found, skip
      }
    },
  };
}
