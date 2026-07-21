// After a runtime package install/removal updates the PWA fragment in
// IndexedDB (BrowserPackageManager.#syncPwaFragments), the service worker
// already serves an up-to-date `manifest.webmanifest` — it reads IndexedDB
// fresh on every request. But the browser only parsed `<link rel="manifest">`
// ONCE, at page load, so its in-memory manifest (the install prompt, and the
// manifest's declared fields as the browser reads them — visible in
// DevTools → Application → Manifest) stays frozen until something makes it
// re-consume. That "something" used to be a manual reload / service-worker
// update.
//
// Re-attaching the manifest `<link>` with a fresh, cache-busting href triggers
// Chromium's manifest-change invalidation (it recomputes the manifest URL and
// notifies its consumers), so the install pipeline / DevTools re-fetch the
// (dynamically served) manifest on demand — no full page reload. The SW route
// matches on the pathname, so the extra query param doesn't change which
// response is served, and `start_url`/`scope`/`id` are unaffected (they resolve
// to the same directory, dropping the query).
//
// Caveat (unavoidable, not app-fixable): the OS-level registrations the manifest
// drives — file associations and launch_handler — are snapshotted by the OS at
// install time and only re-read on the browser's own throttled manifest-update
// schedule, so those still lag. The reliable, immediate signal is the served
// manifest itself (DevTools → Application → Manifest).

// Monotonic per-session revision so each re-attach uses a distinct href (a
// counter, not a timestamp — deterministic and dependency-free).
let manifestRevision = 0;

/**
 * Force the browser to re-consume `manifest.webmanifest` by replacing the
 * `<link rel="manifest">` element with a fresh, cache-busting one. No-op when
 * there is no DOM or no manifest link (dev mode / offline disabled — the build
 * only injects the link when the service worker is enabled).
 */
export function refreshPwaManifestLink(): void {
  if (typeof document === "undefined") return;
  const existing = document.querySelector<HTMLLinkElement>(
    'link[rel="manifest"]',
  );
  if (!existing) return;
  // An absent/empty href would resolve to the document URL (new URL("", base)
  // does not throw), producing a manifest link pointing at the HTML page. Bail.
  if (!existing.getAttribute("href")) return;

  let href: string;
  try {
    const url = new URL(existing.href, document.baseURI);
    url.searchParams.set("ph-manifest-rev", String(++manifestRevision));
    href = url.toString();
  } catch {
    return;
  }

  const link = document.createElement("link");
  link.rel = "manifest";
  // Preserve crossorigin (vite-plugin-pwa sets it when useCredentials is on).
  if (existing.crossOrigin) link.crossOrigin = existing.crossOrigin;
  link.href = href;
  existing.replaceWith(link);
}
