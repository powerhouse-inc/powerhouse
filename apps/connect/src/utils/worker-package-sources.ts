import type { WorkerPackageSource } from "@powerhousedao/reactor-browser/rpc";
import { isWorkerBundleResponse, joinBase } from "./reactor-worker-url.js";

/**
 * Where `ph connect build` publishes the prebuilt local-package model bundles
 * and the manifest naming them, next to the worker bundle itself.
 */
export const WORKER_PACKAGES_DIR = "__reactor_worker__/packages/";
export const WORKER_PACKAGES_MANIFEST = `${WORKER_PACKAGES_DIR}manifest.json`;

/**
 * The project's own models entry as the dev server serves it. Vite's
 * transform pipeline absolutizes its chunk imports and rewrites bare
 * specifiers to /node_modules/.vite/deps/ URLs, so the result is directly
 * importable from a worker - the dev server is the bundler.
 */
export const DEV_PROJECT_MODELS_PATH = "dist/browser/document-models/index.js";

/** Source name for the project's own package (vetra's local package). */
export const PROJECT_PACKAGE_SOURCE_NAME = "ph:project-package";

type ManifestEntry = { name: string; version?: string; file: string };

async function probeJavaScript(url: URL): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return isWorkerBundleResponse({
      ok: res.ok,
      contentType: res.headers.get("content-type"),
    });
  } catch {
    return false;
  }
}

async function fetchManifest(baseUrl: string): Promise<ManifestEntry[]> {
  try {
    const res = await fetch(
      joinBase(baseUrl, WORKER_PACKAGES_MANIFEST, window.location.origin),
    );
    if (!res.ok) return [];
    const parsed: unknown = await res.json();
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ManifestEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ManifestEntry).name === "string" &&
        typeof (entry as ManifestEntry).file === "string",
    );
  } catch {
    return [];
  }
}

/**
 * The project's models source as served right now, with a cache-busting query
 * so a watch rebuild's re-registration imports the fresh file rather than the
 * worker's cached module. Null when the dev server does not serve one.
 */
export async function resolveDevProjectSource(
  baseUrl: string,
): Promise<WorkerPackageSource | null> {
  const url = joinBase(
    baseUrl,
    DEV_PROJECT_MODELS_PATH,
    window.location.origin,
  );
  if (!(await probeJavaScript(url))) return null;
  url.searchParams.set("t", String(Date.now()));
  return { name: PROJECT_PACKAGE_SOURCE_NAME, url: url.href };
}

/**
 * URL-addressed packages the worker should load: the production manifest's
 * prebuilt bundles when deployed, plus the dev server's live project models
 * when present. Either list may be empty; both empty means this deployment
 * has no local packages (or predates the feature).
 */
export async function resolveLocalPackageSources(
  baseUrl: string,
): Promise<WorkerPackageSource[]> {
  const sources: WorkerPackageSource[] = [];
  for (const entry of await fetchManifest(baseUrl)) {
    sources.push({
      name: entry.name,
      version: entry.version,
      url: joinBase(
        baseUrl,
        `${WORKER_PACKAGES_DIR}${entry.file}`,
        window.location.origin,
      ).href,
    });
  }
  const devProject = await resolveDevProjectSource(baseUrl);
  if (devProject) {
    sources.push(devProject);
  }
  return sources;
}
