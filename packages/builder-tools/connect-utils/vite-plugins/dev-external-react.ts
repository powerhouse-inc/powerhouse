import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import {
  DEFAULT_VENDOR_INCLUDE,
  VENDOR_URL_PREFIX,
  prebuildConnectVendor,
  type PrebuiltVendor,
} from "../externalize-vendor.js";
import { BUNDLED_PACKAGES_DEV_URL } from "./ph-bundled-packages.js";

const REACT_DEPS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
];

const SHIM_PATH = "__ph/dev-react-shim/";
const VITE_DEPS_PATH = "node_modules/.vite/deps";

// Content-Type for the asset extensions the vendor build emits; JS is the default.
const VENDOR_MIME: Record<string, string> = {
  ".css": "text/css",
  ".map": "application/json",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Opt-in: also serve the heavy stable Connect libs from a prebuilt vendor
// bundle, so the long-lived dev server never dep-optimizes them (~1–2 GB
// resident). Set PH_CONNECT_EXTERNALIZE_VENDOR=1 to enable.
const VENDOR_MODE = process.env.PH_CONNECT_EXTERNALIZE_VENDOR === "1";
// Extra specifiers to vendor on top of the defaults, comma-separated. Lets a
// project add its own stable heavy deps without code changes.
const VENDOR_EXTRA = (process.env.PH_CONNECT_VENDOR_EXTRA ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const HEAVY_LIBS = [...DEFAULT_VENDOR_INCLUDE, ...VENDOR_EXTRA];

// Vite serves dev module URLs under the resolved `base`. Join base + path
// while collapsing the double slash so `base: "/"` stays byte-identical.
function withBase(base: string, p: string): string {
  return `${base}${p}`.replace(/\/{2,}/g, "/");
}

// Keep the matched specifiers bare in dev (Vite otherwise rewrites externals to
// "/@id/<spec>") so the import map resolves them; predicate matching supported.
type Externals = Array<string | ((id: string) => boolean)>;
function externalizePlugin(externals: Externals): Plugin | undefined {
  try {
    const require = createRequire(import.meta.url);
    const mod = require("vite-plugin-externalize-dependencies") as {
      default?: (o: { externals: Externals }) => Plugin;
    } & ((o: { externals: Externals }) => Plugin);
    const factory = mod.default ?? mod;
    return factory({ externals });
  } catch {
    return undefined;
  }
}

/**
 * Dev-only sibling of `esmExternalRequirePlugin`. The build path externalizes
 * React via Rolldown so an importmap hands the same React instance to both
 * Connect and CDN-served editor packages. Rolldown plugins don't run in
 * `vite createServer`, and Vite's pre-bundled CJS deps only expose a `default`
 * export — so a CDN editor that does `import { lazy } from "react"` would
 * fail with "no named export 'lazy'".
 *
 * This plugin owns the page import map. It always:
 *   1. Forces React into `optimizeDeps.include` so the optimizer always knows
 *      about it.
 *   2. Serves a shim per React module at a stable URL. Each shim imports
 *      from Vite's live pre-bundled URL (sharing Connect's React instance)
 *      and re-exports React's named members so editors importing
 *      `{ lazy }`, `{ jsx }`, etc. work.
 *   3. Rewrites the page importmap to point at those shim URLs.
 *
 * When PH_CONNECT_EXTERNALIZE_VENDOR=1 it additionally prebuilds the heavy
 * stable libs (design-system, reactor-browser, …) into a static vendor bundle,
 * externalizes them from the dev server, serves the bundle, and adds them to
 * the SAME import map. The vendor's React imports stay bare → resolve through
 * the React shims above → one React instance across Connect, the vendor, and
 * CDN editors.
 */
// Async factory: in VENDOR_MODE it runs the vendor prebuild up front (Vite
// awaits a Promise<PluginOption>), so `vendor` is known before any plugin hook
// fires. The heavy libs are excluded from the optimizer — and the externalize
// plugin is added — ONLY when a valid bundle will be served. On prebuild
// failure they stay dev-optimized (no broken bare imports) and neither the
// import map nor the externalizer touch them.
export async function devReactImportmapPlugin(
  projectRoot: string = process.cwd(),
): Promise<Plugin | Plugin[]> {
  let namedExports = new Map<string, string[]>();
  let base = "/";
  let vendor: PrebuiltVendor | null = null;

  if (VENDOR_MODE) {
    const errorRef: { message?: string } = {};
    vendor = await prebuildConnectVendor({
      dirname: projectRoot,
      include: HEAVY_LIBS,
      errorRef,
    });
    if (!vendor) {
      const detail = errorRef.message ? `: ${errorRef.message}` : "";
      console.warn(
        `[connect] PH_CONNECT_EXTERNALIZE_VENDOR set but vendor prebuild failed; falling back to dep-optimizing the heavy libs${detail}`,
      );
    }
  }

  // Externalize exactly the specifiers in the vendor import map (not broad
  // prefixes) so an undiscovered subpath stays resolvable instead of 404ing.
  const ext = vendor
    ? externalizePlugin([(id) => id in vendor!.imports])
    : undefined;
  if (vendor && !ext) {
    console.warn(
      "[connect] PH_CONNECT_EXTERNALIZE_VENDOR set and vendor prebuilt, but vite-plugin-externalize-dependencies is not installed; falling back to dep-optimizing the heavy libs (install it to enable the vendor)",
    );
  }
  const vendorActive = !!(vendor && ext);

  const main: Plugin = {
    name: "ph-dev-react-importmap",
    apply: "serve",
    config(cfg) {
      cfg.optimizeDeps ??= {};
      const include = new Set(cfg.optimizeDeps.include ?? []);
      REACT_DEPS.forEach((d) => include.add(d));
      if (vendorActive) {
        // The heavy libs are served from the prebuilt vendor; force-including
        // them would pre-bundle them anyway (and leave their excluded deps —
        // e.g. zod subpaths — as unmapped bare imports). Drop them from include
        // and exclude them so the optimizer never touches them.
        HEAVY_LIBS.forEach((d) => include.delete(d));
        cfg.optimizeDeps.exclude = [
          ...new Set([...(cfg.optimizeDeps.exclude ?? []), ...HEAVY_LIBS]),
        ];
      }
      cfg.optimizeDeps.include = [...include];
    },
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

      // Serve the prebuilt vendor bundle (JS/CSS/maps + shared chunks/assets).
      if (vendorActive) {
        const vendorDir = vendor!.vendorDir;
        server.middlewares.use(VENDOR_URL_PREFIX, (req, res, next) => {
          const name = (req.url ?? "").split("?")[0].replace(/^\/+/, "");
          const file = path.join(vendorDir, name);
          // Path-segment containment (not a string prefix): reject anything that
          // escapes vendorDir, incl. siblings like `.ph-vendor.lock`.
          const rel = path.relative(vendorDir, file);
          if (!name || rel.startsWith("..") || path.isAbsolute(rel)) {
            return next();
          }
          // Stream (don't buffer multi-MB wasm/.data); a missing file → next().
          const stream = createReadStream(file);
          stream.on("error", () => {
            if (!res.headersSent) next();
          });
          stream.once("open", () => {
            const ext = file.slice(file.lastIndexOf("."));
            res.setHeader(
              "Content-Type",
              VENDOR_MIME[ext] ?? "text/javascript",
            );
            // Content-hashed chunks/assets are immutable; entries + map can change.
            const hashed =
              name.startsWith("chunks/") || name.startsWith("assets/");
            res.setHeader(
              "Cache-Control",
              hashed ? "public, max-age=31536000, immutable" : "no-cache",
            );
            stream.pipe(res);
          });
        });
      }

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
        const imports: Record<string, string> = Object.fromEntries(
          REACT_DEPS.map((id) => [
            id,
            `${shimPrefix}${id}.js?v=${browserHash}`,
          ]),
        );
        // Heavy libs resolve to the prebuilt vendor; their bare React imports
        // fall through to the React shim entries above.
        if (vendorActive) {
          Object.assign(imports, vendor!.imports);
          // When Connect is vendored it isn't dev-processed, so its dynamic
          // `import("ph-bundled-packages-virtual")` (project local packages)
          // can't be transformed in place. Point it at the URL Vite serves the
          // virtual module at (phBundledPackagesPlugin), so bundled local
          // packages still register.
          if (vendor!.imports["@powerhousedao/connect"]) {
            imports["ph-bundled-packages-virtual"] = withBase(
              base,
              BUNDLED_PACKAGES_DEV_URL,
            );
          }
        }
        return html.replace(
          /<script type="importmap">[\s\S]*?<\/script>/,
          `<script type="importmap">${JSON.stringify({ imports }, null, 2)}</script>`,
        );
      },
    },
  };

  // The externalizer runs alongside `main` so Connect's source leaves the heavy
  // libs bare (→ import map → vendor); React stays optimized via the shims.
  return vendorActive ? [ext!, main] : main;
}
