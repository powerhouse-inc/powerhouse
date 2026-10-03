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

/**
 * Metadata file `prebuildReactorWorker` writes alongside the bundle (see
 * builder-tools' `reactor-worker-build.ts`): `{sourceDigest, vendorKey,
 * nodeEnv}`, a digest of everything that shapes the bundle's output —
 * connect's dist entry, the installed builder-tools version, and the
 * monorepo `@powerhousedao/reactor`/`reactor-browser` dist state. Served
 * no-cache, sibling of the entry.
 */
const REACTOR_WORKER_META_FILE = "worker-meta.json";

/**
 * Fetches the resolved worker bundle's build digest from its sibling
 * metadata file, or null when there is nothing to fetch (`workerUrl` is
 * absent — the monorepo-source-resolution case, which has no staleness
 * problem to begin with) or the fetch/parse fails for any reason (offline,
 * a server predating this file, a malformed body). Callers fold a non-null
 * result into `appBuildId` (see `getAppBuildId` in `./build-info.js`) so a
 * rebuilt dev worker bundle changes the tab's version fingerprint even when
 * the static package version alone would not.
 */
export async function fetchReactorWorkerBuildDigest(
  workerUrl: string | null | undefined,
): Promise<string | null> {
  if (!workerUrl) return null;
  try {
    const metaUrl = new URL(REACTOR_WORKER_META_FILE, workerUrl);
    const res = await fetch(metaUrl, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as { sourceDigest?: unknown };
    return typeof data.sourceDigest === "string" && data.sourceDigest
      ? data.sourceDigest
      : null;
  } catch {
    return null;
  }
}
