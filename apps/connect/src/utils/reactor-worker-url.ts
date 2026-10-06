/**
 * Stable path of the prebuilt reactor SharedWorker bundle, relative to the
 * deploy base. `ph connect build` emits it next to `__vendor__/`; the dev
 * server serves it from the same path, building lazily on first request.
 */
export const REACTOR_WORKER_BUNDLE_PATH =
  "__reactor_worker__/reactor.worker.js";

/** Written beside the bundle by the prebuild; carries its `sourceDigest`. */
export const REACTOR_WORKER_META_PATH = "__reactor_worker__/worker-meta.json";

/** `path` under the deploy base, absolute against `origin`. */
export function joinBase(baseUrl: string, path: string, origin: string): URL {
  return new URL(`${baseUrl}/${path}`.replace(/\/{2,}/g, "/"), origin);
}

/** The bundle's URL under the deploy base, absolute against the page origin. */
export function packagedReactorWorkerUrl(baseUrl: string, origin: string): URL {
  return joinBase(baseUrl, REACTOR_WORKER_BUNDLE_PATH, origin);
}

// Content type, not just status: SPA hosts answer unknown paths with a 200 HTML page.
export function isWorkerBundleResponse(probe: {
  ok: boolean;
  contentType: string | null;
}): boolean {
  return probe.ok && (probe.contentType ?? "").includes("javascript");
}

export type PackagedReactorWorker = { url: string; sourceDigest: string };

/** Null when the deployment serves no bundle metadata (SPA HTML, error status, bad JSON). */
export async function resolvePackagedReactorWorker(
  baseUrl: string,
): Promise<PackagedReactorWorker | null> {
  const origin = window.location.origin;
  try {
    const res = await fetch(
      joinBase(baseUrl, REACTOR_WORKER_META_PATH, origin),
      { cache: "no-cache" },
    );
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      return null;
    }
    const meta = (await res.json()) as { sourceDigest?: unknown } | null;
    if (typeof meta?.sourceDigest !== "string") return null;
    return {
      url: packagedReactorWorkerUrl(baseUrl, origin).href,
      sourceDigest: meta.sourceDigest,
    };
  } catch {
    return null;
  }
}
