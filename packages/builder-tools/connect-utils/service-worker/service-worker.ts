/// <reference lib="webworker" />
//
// Connect's service worker (injectManifest strategy).
//
// This file is NOT bundled into @powerhousedao/builder-tools' dist entry — it
// is copied verbatim into `dist/service-worker/` and compiled by
// vite-plugin-pwa's own build pass at the CONSUMER's build time (see
// connectPwaPlugins in ../vite-plugins/pwa.ts). It is deliberately excluded
// from the package's `tsc` project (webworker globals + the `virtual:` import
// don't belong to the Node build graph).
//
// It reproduces what Workbox `generateSW` used to bake from BASE_WORKBOX — the
// precache, the runtime-caching rules, the navigation fallback and the
// prompt/SKIP_WAITING lifecycle — PLUS the two things generateSW cannot do:
//  1. serve a DYNAMIC web-app manifest, merging the build-embedded base with
//     the fragments dynamically-installed packages mirror into IndexedDB;
//  2. accept OS share-target POSTs, stashing the shared files for the SPA.
//
// Route registration order matters — Workbox is first-match-wins.

import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import {
  CacheFirst,
  CacheOnly,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from "workbox-strategies";
// Barrel import (not a subpath): shared's bundler only emits dist/connect/
// index.js, so subpaths like ./connect/pwa-manifest have no dist target. The
// barrel is `sideEffects: false`, so rolldown tree-shakes the unused siblings
// (env-config/json-adapter) — including their dynamic node:fs import — out of
// the worker bundle. The IDB schema constants are shared with the SPA writer
// (apps/connect/src/utils/pwa-idb.ts) so the two can't desync.
import {
  mergeManifest,
  PWA_IDB_KEY,
  PWA_IDB_NAME,
  PWA_IDB_STORE,
  PWA_IDB_VERSION,
  PWA_SHARE_TARGET_REDIRECT_PARAM,
  toRegExpOrString,
} from "@powerhousedao/shared/connect";
import {
  EMBEDDED_BASE_MANIFEST,
  EXTRA_RUNTIME_CACHING,
  NAVIGATE_FALLBACK_DENYLIST_EXTRA,
  SHARE_TARGET_ACTION,
  SHARE_TARGET_INBOX_CACHE,
} from "virtual:ph-sw-config";

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    // The injectManifest injection point (replaced with the precache list).
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  };

// ── lifecycle ──────────────────────────────────────────────────────────────
// skipWaiting is NOT called on install: the SPA surfaces a refresh prompt and
// posts SKIP_WAITING when the user accepts (identical contract to the old
// generateSW `registerType: "prompt"` — registerServiceWorker.ts is unchanged).
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();
cleanupOutdatedCaches();

// ── dynamic web-app manifest ─────────────────────────────────────────────────
// Registered before precache so it always wins for manifest.webmanifest (which
// is also excluded from the precache glob). Every request reads IndexedDB
// fresh, so a package install/removal is reflected on the next manifest fetch
// with no service-worker restart. Base-wins scalar policy: a dynamically
// installed (untrusted) package can add icons/handlers but cannot rename or
// re-theme Connect.
type DynamicFragmentRecord = {
  fragment?: { manifest?: unknown; runtimeCaching?: unknown };
};

async function readDynamicFragmentRecord(): Promise<
  DynamicFragmentRecord | undefined
> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(PWA_IDB_NAME, PWA_IDB_VERSION);
    } catch {
      resolve(undefined);
      return;
    }
    // If the DB doesn't exist yet (no package has synced), ABORT the upgrade so
    // we don't leave a store-less v1 DB behind — that would later block the
    // page's own open (same version → no upgrade → missing store → write
    // fails). The page owns creating the DB/store.
    request.onupgradeneeded = () => {
      try {
        request.transaction?.abort();
      } catch {
        /* ignore */
      }
    };
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PWA_IDB_STORE)) {
        db.close();
        resolve(undefined);
        return;
      }
      try {
        const tx = db.transaction(PWA_IDB_STORE, "readonly");
        const getReq = tx.objectStore(PWA_IDB_STORE).get(PWA_IDB_KEY);
        getReq.onsuccess = () => {
          resolve(getReq.result);
          db.close();
        };
        getReq.onerror = () => {
          resolve(undefined);
          db.close();
        };
      } catch {
        resolve(undefined);
        db.close();
      }
    };
  });
}

registerRoute(
  ({ url }) => url.pathname.endsWith("manifest.webmanifest"),
  async () => {
    let manifest: unknown = EMBEDDED_BASE_MANIFEST;
    try {
      const record = await readDynamicFragmentRecord();
      const fragmentManifest = record?.fragment?.manifest;
      if (fragmentManifest) {
        manifest = mergeManifest(
          EMBEDDED_BASE_MANIFEST as Record<string, unknown>,
          // The record was validated by the page before it was written.
          fragmentManifest as never,
          { scalarPolicy: "base-wins" },
        );
      }
    } catch {
      // Fall back to the embedded base — a broken fragment must never take the
      // manifest down.
    }
    return new Response(JSON.stringify(manifest), {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "no-cache",
      },
    });
  },
);

// ── OS share target ──────────────────────────────────────────────────────────
// The manifest's share_target.action points here (Connect-owned route). We
// stash every shared file into a Cache and redirect to the app root; the SPA
// drains the inbox on boot (see the launch-queue pickup). Field names are
// contributor-declared, so we collect File values regardless of field name.
registerRoute(
  ({ url, request }) =>
    request.method === "POST" && url.pathname.endsWith(SHARE_TARGET_ACTION),
  async ({ request }) => {
    try {
      const formData = await request.formData();
      const cache = await caches.open(SHARE_TARGET_INBOX_CACHE);
      let index = 0;
      for (const value of formData.values()) {
        if (typeof value === "string") continue;
        const file = value;
        const key = `/__ph-share/${index++}/${encodeURIComponent(file.name)}`;
        await cache.put(
          new Request(key),
          new Response(file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-PH-Share-Name": encodeURIComponent(file.name),
            },
          }),
        );
      }
    } catch {
      // Even if stashing fails, still redirect so the user lands in the app.
    }
    // 303 so the browser follows with GET. Relative redirect tracks the base.
    return Response.redirect(`./?${PWA_SHARE_TARGET_REDIRECT_PARAM}=1`, 303);
  },
  "POST",
);

// ── precache ─────────────────────────────────────────────────────────────────
// Precache the app shell + PGlite wasm/data. manifest.webmanifest is excluded
// from the glob (see connectPwaPlugins) so the dynamic route above is the sole
// producer at that URL. The __WB_MANIFEST property below is the injectManifest
// injection point — workbox-build replaces it with the precache list at build
// time (the token is written once, on the code line, never in prose).
precacheAndRoute(self.__WB_MANIFEST);

// ── runtime caching (ported 1:1 from the old BASE_WORKBOX, same order) ───────
// Inter font stays on Google's CDN; cache it after the first online load.
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "google-fonts-stylesheets" }),
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      // statuses [0, 200]: 0 permits opaque cross-origin font responses.
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);
// Document-model editors/packages loaded at runtime from the registry CDN. The
// registry ORIGIN is a runtime value, so match the stable "/-/cdn/" path. Two
// rules (order matters): unversioned ENTRY points first (SWR — a newer editor
// refreshes online, cached copy serves offline), then a catch-all CacheFirst
// for the content-hashed (immutable) assets. statuses [0, 200] on both — the
// editor JS is a CORS import (200) but its stylesheet/assets are no-cors
// (opaque/0); [200] alone silently dropped those and broke styles offline.
registerRoute(
  ({ url }) =>
    url.pathname.includes("/-/cdn/") &&
    (url.pathname.endsWith("/browser/index.js") ||
      url.pathname.endsWith("/style.css") ||
      url.pathname.endsWith("/package.json")),
  new StaleWhileRevalidate({
    cacheName: "ph-package-cdn-entry",
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);
registerRoute(
  ({ url }) => url.pathname.includes("/-/cdn/"),
  new CacheFirst({
    cacheName: "ph-package-cdn",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);
// Runtime config: NetworkFirst so a fresh value wins online, last-known serves
// offline (it is precache-ignored). The timeout stops a flaky network stalling
// boot until the browser's own fetch timeout.
registerRoute(
  ({ url }) => url.pathname.endsWith("/powerhouse.config.json"),
  new NetworkFirst({ cacheName: "ph-runtime-config", networkTimeoutSeconds: 5 }),
);

// ── extra runtime caching ────────────────────────────────────────────────────
// Appended AFTER the built-ins — Workbox is first-match-wins, so a contribution
// cannot shadow a built-in rule for the same URL (intentional). Two sources:
// build-time package/project rules (EXTRA_RUNTIME_CACHING, registered now) and
// runtime-installed package rules (read from IndexedDB at startup below).
// All five Workbox strategies a contributed rule may name, so a rule's caching
// semantics are honored faithfully (e.g. NetworkOnly never caches — remapping
// it to NetworkFirst would silently start caching an endpoint a package meant
// to keep uncached).
const STRATEGIES = {
  CacheFirst,
  CacheOnly,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} as const;

type RuntimeCachingRule = (typeof EXTRA_RUNTIME_CACHING)[number];

function registerRuntimeCachingRule(rule: RuntimeCachingRule) {
  const Strategy = STRATEGIES[rule.handler] ?? StaleWhileRevalidate;
  const options = rule.options ?? {};
  const plugins = [];
  if (options.expiration) {
    plugins.push(new ExpirationPlugin(options.expiration));
  }
  if (options.cacheableResponse) {
    plugins.push(new CacheableResponsePlugin(options.cacheableResponse));
  }
  registerRoute(
    toRegExpOrString(rule.urlPattern),
    new Strategy({
      ...(options.cacheName ? { cacheName: options.cacheName } : {}),
      ...(typeof options.networkTimeoutSeconds === "number"
        ? { networkTimeoutSeconds: options.networkTimeoutSeconds }
        : {}),
      plugins,
    }),
    rule.method ?? "GET",
  );
}

for (const rule of EXTRA_RUNTIME_CACHING) registerRuntimeCachingRule(rule);

// Runtime-installed packages' caching rules, mirrored to IndexedDB by the SPA.
// Best-effort: routes register when this async read resolves (shortly after SW
// startup), so a rule added by a package installed in THIS session only takes
// full effect on the next SW activation. Build-time rules above are the
// reliable path.
void readDynamicFragmentRecord().then((record) => {
  const rules = record?.fragment?.runtimeCaching;
  if (!Array.isArray(rules)) return;
  for (const rule of rules) {
    try {
      registerRuntimeCachingRule(rule as RuntimeCachingRule);
    } catch {
      // A malformed rule must not abort the rest.
    }
  }
});

// ── navigation fallback ──────────────────────────────────────────────────────
// SPA fallback to index.html (resolved against the SW's own location, so it
// tracks the deploy base). Denylist: the built-ins plus any BUILD-TIME
// contributed patterns (NAVIGATE_FALLBACK_DENYLIST_EXTRA). This route is
// registered synchronously at SW startup, before the async IDB read above, so
// that offline SPA navigation works immediately on a cold SW start — which is
// why navigateFallbackDenylist from a RUNTIME-installed package is intentionally
// build-time-only (delaying this route to await IDB would break offline
// navigation during that window). Documented in the PWA guide.
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const denylist: RegExp[] = [
  /\/powerhouse\.config\.json$/,
  /^\/health$/,
  /\/__/,
  ...NAVIGATE_FALLBACK_DENYLIST_EXTRA.map((pattern) => {
    const value = toRegExpOrString(pattern);
    return typeof value === "string" ? new RegExp(escapeForRegExp(value)) : value;
  }),
];
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist }),
);
