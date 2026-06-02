import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

const REACT_DEPS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
];

const SHIM_PATH = "__ph/dev-react-shim/";
const VITE_DEPS_PATH = "node_modules/.vite/deps";

// Vite serves dev module URLs under the resolved `base`. Join base + path
// while collapsing the double slash so `base: "/"` stays byte-identical.
function withBase(base: string, p: string): string {
  return `${base}${p}`.replace(/\/{2,}/g, "/");
}

/**
 * Dev-only sibling of `esmExternalRequirePlugin`. The build path externalizes
 * React via Rolldown so an importmap hands the same React instance to both
 * Connect and CDN-served editor packages. Rolldown plugins don't run in
 * `vite createServer`, and Vite's pre-bundled CJS deps only expose a `default`
 * export — so a CDN editor that does `import { lazy } from "react"` would
 * fail with "no named export 'lazy'".
 *
 * This plugin:
 *   1. Forces React into `optimizeDeps.include` so the optimizer always knows
 *      about it.
 *   2. Serves a shim per React module at a stable URL. Each shim imports
 *      from Vite's live pre-bundled URL (sharing Connect's React instance)
 *      and re-exports React's named members so editors importing
 *      `{ lazy }`, `{ jsx }`, etc. work.
 *   3. Rewrites the page importmap to point at those shim URLs.
 */
export function devReactImportmapPlugin(): Plugin {
  let namedExports = new Map<string, string[]>();
  let base = "/";

  return {
    name: "ph-dev-react-importmap",
    apply: "serve",
    config: () => ({ optimizeDeps: { include: REACT_DEPS } }),
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      // Resolve React's named exports from the consumer project so we don't
      // hardcode lists that drift across React versions.
      const requireFromRoot = createRequire(
        path.join(server.config.root, "package.json"),
      );
      namedExports = new Map(
        REACT_DEPS.map((id) => {
          try {
            const mod = requireFromRoot(id) as Record<string, unknown>;
            return [id, Object.keys(mod).filter((k) => k !== "default")];
          } catch {
            return [id, []];
          }
        }),
      );

      // Match the base-prefixed shim URL, and the bare path for robustness.
      const shimPrefixes = [withBase(base, SHIM_PATH), `/${SHIM_PATH}`];
      server.middlewares.use((req, res, next) => {
        const prefix = shimPrefixes.find((p) => req.url?.startsWith(p));
        if (!prefix) return next();
        const id = req.url!.slice(prefix.length).replace(/\.js(\?.*)?$/, "");
        if (!REACT_DEPS.includes(id)) return next();

        const optimizer = server.environments.client.depsOptimizer;
        const info =
          optimizer?.metadata.optimized[id] ??
          optimizer?.metadata.discovered[id];
        if (!optimizer || !info) {
          res.statusCode = 404;
          res.end();
          return;
        }

        const browserHash = info.browserHash ?? optimizer.metadata.browserHash;
        const depUrl = `${withBase(base, VITE_DEPS_PATH)}/${path.basename(info.file)}?v=${browserHash}`;
        const names = namedExports.get(id) ?? [];

        res.setHeader("Content-Type", "application/javascript");
        res.end(
          `import * as M from ${JSON.stringify(depUrl)};\n` +
            `const ns = M.default ?? M;\n` +
            `export default ns;\n` +
            (names.length
              ? `export const { ${names.join(", ")} } = ns;\n`
              : ""),
        );
      });
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const browserHash =
          ctx.server?.environments.client.depsOptimizer?.metadata.browserHash;
        if (!browserHash) return;
        const shimPrefix = withBase(base, SHIM_PATH);
        const imports = Object.fromEntries(
          REACT_DEPS.map((id) => [
            id,
            `${shimPrefix}${id}.js?v=${browserHash}`,
          ]),
        );
        return html.replace(
          /<script type="importmap">[\s\S]*?<\/script>/,
          `<script type="importmap">${JSON.stringify({ imports }, null, 2)}</script>`,
        );
      },
    },
  };
}
