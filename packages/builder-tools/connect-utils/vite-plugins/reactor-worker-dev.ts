import { createReadStream } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import {
  prebuildReactorWorker,
  REACTOR_WORKER_ENTRY,
  REACTOR_WORKER_MIME,
  REACTOR_WORKER_URL_PREFIX,
  type PrebuiltReactorWorker,
} from "../reactor-worker-build.js";
import {
  prebuildWorkerPackages,
  workerLocalPackages,
} from "../worker-packages-build.js";

// Dev bundle cache, sibling of the vendor's `.ph-vendor`.
const DEV_BUNDLE_DIR = "node_modules/.ph-reactor-worker";
// The local packages' model bundles, apart: a worker rebuild replaces its dir.
const DEV_PACKAGES_DIR = "node_modules/.ph-reactor-worker-packages";
// Where the tab reads them, as from `ph connect build`'s output.
const PACKAGES_PREFIX = "packages/";

function withBase(base: string, p: string): string {
  return `${base}${p}`.replace(/\/{2,}/g, "/");
}

/**
 * Dev-only: serve Connect's reactor SharedWorker bundle under
 * `<base>__reactor_worker__/`, building it lazily on first request.
 *
 * The dev server serves Connect from its prebuilt dist in node_modules, where
 * `dist/reactor.worker.js` is a library artifact no worker can resolve. The
 * tab GETs `worker-meta.json` here (JSON, no-cache, written by
 * `prebuildReactorWorker`) to find the bundle and fold its `sourceDigest`
 * into its version fingerprint; without this plugin that GET fails and the
 * worker feature reports itself unavailable instead of dying opaquely.
 *
 * Lazy because it is a full `vite build` of the reactor + PGlite graph. The
 * result is cached in node_modules/.ph-reactor-worker until the installed
 * Connect, its upstream dists, or builder-tools change (`computeSourceDigest`).
 *
 * `packages/` serves the configured local packages' model bundles, built at
 * the first request of a server's life by `ph connect build`'s own prebuild.
 * The project's models are not among them: the tab loads those live.
 */
export function reactorWorkerDevPlugin(
  projectRoot: string,
  options: {
    /** powerhouse.config.json `packages`. */
    packages?: readonly { packageName: string; provider?: string }[];
  } = {},
): Plugin {
  let base = "/";
  let building: Promise<PrebuiltReactorWorker | null> | null = null;
  let packagesBuilding: Promise<string | null> | null = null;

  const ensurePackagesBuilt = (): Promise<string | null> => {
    packagesBuilding ??= (async () => {
      const outDir = path.join(projectRoot, DEV_PACKAGES_DIR);
      const errorRef: { message?: string } = {};
      const built = await prebuildWorkerPackages({
        dirname: projectRoot,
        packages: workerLocalPackages(projectRoot, options.packages, {
          own: false,
        }),
        outDir,
        nodeEnv: "development",
        errorRef,
      });
      if (!built) {
        console.warn(
          `[connect] reactor worker package bundles failed to build${
            errorRef.message ? `: ${errorRef.message}` : ""
          }`,
        );
        packagesBuilding = null;
        return null;
      }
      return outDir;
    })();
    return packagesBuilding;
  };

  const ensureBuilt = (): Promise<PrebuiltReactorWorker | null> => {
    building ??= (async () => {
      const errorRef: { message?: string } = {};
      const built = await prebuildReactorWorker({
        dirname: projectRoot,
        outDir: path.join(projectRoot, DEV_BUNDLE_DIR),
        nodeEnv: "development",
        errorRef,
      });
      if (!built) {
        console.warn(
          `[connect] reactor worker bundle build failed${
            errorRef.message ? `: ${errorRef.message}` : ""
          }`,
        );
        // Allow a retry on the next request instead of caching the failure
        // for the server's lifetime.
        building = null;
      }
      return built;
    })();
    return building;
  };

  return {
    name: "ph-reactor-worker-dev",
    apply: "serve",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      const prefixes = [
        withBase(base, REACTOR_WORKER_URL_PREFIX),
        REACTOR_WORKER_URL_PREFIX,
      ];
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const prefix = prefixes.find((p) => url.startsWith(p));
        if (!prefix) return next();
        const name = url.slice(prefix.length).replace(/^\/+/, "");
        if (!name) return next();

        if (name.startsWith(PACKAGES_PREFIX)) {
          void (async () => {
            const outDir = await ensurePackagesBuilt();
            const file = outDir
              ? path.join(outDir, name.slice(PACKAGES_PREFIX.length))
              : undefined;
            const rel = outDir && file ? path.relative(outDir, file) : "..";
            // None built, or none of that name: no manifest, no packages.
            if (rel.startsWith("..") || path.isAbsolute(rel) || !file) {
              res.statusCode = 404;
              res.end();
              return;
            }
            const stream = createReadStream(file);
            stream.on("error", () => {
              if (res.headersSent) return;
              res.statusCode = 404;
              res.end();
            });
            stream.once("open", () => {
              const ext = file.slice(file.lastIndexOf("."));
              res.setHeader(
                "Content-Type",
                REACTOR_WORKER_MIME[ext] ?? "text/javascript",
              );
              // Built again at each server start, under the same names.
              res.setHeader("Cache-Control", "no-cache");
              stream.pipe(res);
            });
          })();
          return;
        }

        void (async () => {
          const built = await ensureBuilt();
          if (!built) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "text/plain");
            res.end(
              "reactor worker bundle unavailable (build failed; see server log)",
            );
            return;
          }
          const file = path.join(built.outDir, name);
          // Path-segment containment: reject anything escaping the bundle dir.
          const rel = path.relative(built.outDir, file);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            next();
            return;
          }
          const stream = createReadStream(file);
          stream.on("error", () => {
            if (!res.headersSent) next();
          });
          stream.once("open", () => {
            const ext = file.slice(file.lastIndexOf("."));
            res.setHeader(
              "Content-Type",
              REACTOR_WORKER_MIME[ext] ?? "text/javascript",
            );
            // Everything except the entry (stable name, changes with the
            // installed Connect) and the metadata is content-hashed.
            const hashed =
              !name.startsWith(REACTOR_WORKER_ENTRY) && !name.endsWith(".json");
            res.setHeader(
              "Cache-Control",
              hashed ? "public, max-age=31536000, immutable" : "no-cache",
            );
            stream.pipe(res);
          });
        })();
      });
    },
  };
}
