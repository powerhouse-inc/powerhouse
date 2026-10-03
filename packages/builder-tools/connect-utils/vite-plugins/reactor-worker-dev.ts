import { createReadStream } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import {
  prebuildReactorWorker,
  REACTOR_WORKER_ENTRY,
  REACTOR_WORKER_MIME,
  REACTOR_WORKER_URL_PREFIX,
  resolveReactorWorkerSource,
  type PrebuiltReactorWorker,
} from "../reactor-worker-build.js";

// Dev bundle cache, sibling of the vendor's `.ph-vendor`.
const DEV_BUNDLE_DIR = "node_modules/.ph-reactor-worker";

function withBase(base: string, p: string): string {
  return `${base}${p}`.replace(/\/{2,}/g, "/");
}

/**
 * Dev-only: serve Connect's reactor SharedWorker bundle under
 * `<base>__reactor_worker__/`, building it lazily on first request.
 *
 * The dev server serves Connect from its prebuilt dist in node_modules, where
 * `dist/reactor.worker.js` is a library artifact full of bare imports that no
 * worker can resolve (import maps do not apply to workers). The tab probes
 * this stable URL (HEAD) and constructs its SharedWorker from it; without
 * this plugin the probe 404s and the worker feature reports itself
 * unavailable instead of dying opaquely.
 *
 * The build is lazy because it is a full `vite build` of the reactor + PGlite
 * graph: sessions that never enable `reactorWorker` never pay for it. The
 * result is cached in node_modules/.ph-reactor-worker and reused across
 * server restarts until the installed Connect (or the upstream workspace
 * dists it bundles, or builder-tools itself) changes — see
 * `computeSourceDigest` in `../reactor-worker-build.ts`.
 *
 * No special-casing is needed to serve that digest: `worker-meta.json`
 * (written into the bundle dir by `prebuildReactorWorker`) falls through the
 * generic streaming branch below like any other bundle file, picks up
 * `application/json` from `REACTOR_WORKER_MIME` and `no-cache` (it ends in
 * `.json`), and `apps/connect/src/utils/reactor-worker-url.ts` fetches it to
 * fold the digest into the tab's version fingerprint in dev (W0.6).
 */
export function reactorWorkerDevPlugin(projectRoot: string): Plugin {
  let base = "/";
  let building: Promise<PrebuiltReactorWorker | null> | null = null;

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

        // The tab's availability probe: answer from the source check alone so
        // the probe stays fast; the build runs on the first real GET.
        if (req.method === "HEAD" && name === REACTOR_WORKER_ENTRY) {
          if (!resolveReactorWorkerSource(projectRoot)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "text/javascript");
          res.statusCode = 200;
          res.end();
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
