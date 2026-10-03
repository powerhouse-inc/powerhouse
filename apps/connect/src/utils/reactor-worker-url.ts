/**
 * Stable path of the prebuilt reactor SharedWorker bundle, relative to the
 * deploy base. `ph connect build` emits it next to `__vendor__/`; the dev
 * server serves it from the same path, building lazily on first request.
 */
export const REACTOR_WORKER_BUNDLE_PATH =
  "__reactor_worker__/reactor.worker.js";

/** The bundle's URL under the deploy base, absolute against the page origin. */
export function packagedReactorWorkerUrl(baseUrl: string, origin: string): URL {
  return new URL(
    `${baseUrl}/${REACTOR_WORKER_BUNDLE_PATH}`.replace(/\/{2,}/g, "/"),
    origin,
  );
}

/**
 * Whether a probe response proves the bundle is served. The content type
 * matters, not just the status: an SPA host answers unknown paths with
 * index.html and a 200, and constructing a SharedWorker from an HTML document
 * fails with an opaque error.
 */
export function isWorkerBundleResponse(probe: {
  ok: boolean;
  contentType: string | null;
}): boolean {
  return probe.ok && (probe.contentType ?? "").includes("javascript");
}

/**
 * The packaged worker bundle's URL, or null when this deployment does not
 * serve one (the monorepo dev server and monorepo builds, where Vite bundles
 * the worker from source and `import.meta.url` resolution is correct).
 */
export async function resolvePackagedReactorWorkerUrl(): Promise<
  string | null
> {
  const url = packagedReactorWorkerUrl(
    import.meta.env.BASE_URL,
    window.location.origin,
  );
  try {
    const res = await fetch(url, { method: "HEAD" });
    return isWorkerBundleResponse({
      ok: res.ok,
      contentType: res.headers.get("content-type"),
    })
      ? url.href
      : null;
  } catch {
    return null;
  }
}
