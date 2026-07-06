import { type PHConnectPwa } from "@powerhousedao/shared/connect";
import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { connectPwaIconsPlugin } from "./pwa-icons.js";
import {
  applyPwaOverrides,
  FILE_HANDLER_ACTION,
  type ConnectPwaManifest,
  type ConnectWorkboxOptions,
} from "./pwa-overrides.js";

/**
 * Connect's hardcoded PWA manifest. The base layer of the override ladder —
 * package `pwa` fragments and the project's `connect.pwa` block are laid on
 * top of this by `applyPwaOverrides`.
 */
const BASE_MANIFEST: ConnectPwaManifest = {
  name: "Powerhouse Connect",
  short_name: "Connect",
  description:
    "A navigation, collaboration and reporting tool for decentralised and open organisations.",
  theme_color: "#ffffff",
  background_color: "#ffffff",
  display: "standalone",
  start_url: ".",
  scope: ".",
  icons: [
    { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
    { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
    {
      // Full-bleed variant: maskable icons get cropped to the platform shape,
      // so the logo sits inside the safe zone instead of reusing the rounded
      // "any" icon (whose transparent corners would show through the mask).
      src: "pwa-512x512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  // OS-level file associations for the installed PWA (File Handling API,
  // Chromium desktop). Powerhouse documents are zip archives, but keying on
  // application/zip would make Connect a candidate handler for EVERY zip on
  // MIME-keyed platforms — hence the vendor types with the RFC 6839 +zip
  // suffix. Config-contributed handlers are appended after this entry, and
  // Chromium is first-registered-wins per extension, so .phd/.phdm cannot be
  // hijacked by a package. Consuming the launched files happens in the
  // Connect SPA (launchQueue consumer).
  file_handlers: [
    {
      action: FILE_HANDLER_ACTION,
      accept: {
        "application/vnd.powerhouse.document+zip": [".phd"],
        "application/vnd.powerhouse.document-model+zip": [".phdm"],
      },
      // OS file-type icons: the same Powerhouse document icon the in-app
      // import list shows. Declared per spec, but note Chromium doesn't
      // consume them on desktop yet — macOS synthesizes document icons from
      // the app icon (no CFBundleTypeIconFile is written), and Windows
      // support is unimplemented (FileHandlingIconsSupportedByOs() is false,
      // crbug.com/40185571). Shipping them is forward-compatible and costs
      // nothing. Assets emitted by connectPwaIconsPlugin, precached via the
      // png glob.
      icons: [
        {
          src: "document-icon-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "document-icon-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
  ],
  // Opening a handled file focuses the running Connect window (launchQueue
  // delivers the file there) instead of spawning a new window per file.
  launch_handler: { client_mode: "focus-existing" },
};

/**
 * Connect's hardcoded Workbox config. The base layer — overridable additively
 * (extra globs / runtime-caching rules) or by raising the size ceiling via
 * package/project `pwa` config. Function-valued urlPatterns stay here (they
 * are not serialisable, so config-driven rules can only be appended after
 * these, never replace them).
 */
const BASE_WORKBOX: ConnectWorkboxOptions = {
  clientsClaim: true,
  skipWaiting: false, // wait for the user to accept the refresh prompt
  cleanupOutdatedCaches: true,
  // PGlite's wasm + fs bundles are several MB each; Workbox's 2 MiB
  // default would silently skip them and the in-browser Postgres would
  // fail to initialise offline. Raise the ceiling so they precache.
  maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
  // Precache the app shell AND the PGlite assets. The default glob omits
  // `.wasm`/`.data`, but PGlite's Postgres-in-wasm needs both its `.wasm`
  // and its `.data` filesystem bundles, or the in-browser DB fails to
  // initialise offline ("Failed to fetch").
  globPatterns: ["**/*.{js,css,html,wasm,data,ico,png,svg,webp,woff,woff2}"],
  // powerhouse.config.json is operator-editable and served no-cache, so
  // precaching it would freeze runtime config; source maps don't belong
  // in the precache either.
  globIgnores: ["**/powerhouse.config.json", "**/*.map"],
  navigateFallback: "index.html",
  navigateFallbackDenylist: [
    /\/powerhouse\.config\.json$/,
    /^\/health$/,
    /\/__/,
  ],
  runtimeCaching: [
    // Inter font stays on Google's CDN (edge perf, no self-hosting); we
    // just cache it after the first online load so it renders offline.
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.origin === "https://fonts.googleapis.com",
      handler: "StaleWhileRevalidate",
      options: { cacheName: "google-fonts-stylesheets" },
    },
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.origin === "https://fonts.gstatic.com",
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-webfonts",
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
        // statuses [0, 200]: 0 permits opaque cross-origin font responses.
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Document-model editors/packages loaded at runtime from the registry
    // CDN. The registry ORIGIN is a runtime value (packageRegistryUrl), so
    // match the stable "/-/cdn/" path instead. Two rules (order matters —
    // Workbox is first-match-wins): the unversioned ENTRY points first,
    // then a catch-all for the content-hashed assets.
    //
    // statuses: [0, 200] on BOTH — the editor's JS is a CORS module import
    // (200), but its stylesheet is mounted via cross-origin `@import`
    // (no-cors → opaque/0) and its CSS-referenced images/fonts ≥14 KB are
    // also no-cors (0). [200] alone silently dropped those, so styles and
    // icons broke offline. Opaque responses are still applied/displayed by
    // the browser when served from cache.
    //
    // Entry points (browser/index.js, style.css, package.json) are
    // unversioned/mutable → SWR so installing a newer editor refreshes
    // online; offline serves the cached copy.
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.pathname.includes("/-/cdn/") &&
        (url.pathname.endsWith("/browser/index.js") ||
          url.pathname.endsWith("/style.css") ||
          url.pathname.endsWith("/package.json")),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "ph-package-cdn-entry",
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Everything else under /-/cdn/ is content-hashed → immutable.
    // CacheFirst: no revalidation (clean offline network tab), never stale
    // (the hash changes when content changes). Caches opaque (no-cors)
    // images/fonts referenced by the editor CSS.
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.includes("/-/cdn/"),
      handler: "CacheFirst",
      options: {
        cacheName: "ph-package-cdn",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Runtime config: NetworkFirst so a fresh value wins when online, but
    // the last-known config is still served offline (it is precache-
    // ignored above). Without the timeout, a flaky-but-not-dead network
    // stalls boot until the browser's own fetch timeout.
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.pathname.endsWith("/powerhouse.config.json"),
      handler: "NetworkFirst",
      options: { cacheName: "ph-runtime-config", networkTimeoutSeconds: 5 },
    },
  ],
};

/**
 * Service-worker / PWA support for Connect, gated by `connect.app.offline`.
 *
 * When enabled (the default), Workbox `generateSW` precaches the built app
 * shell so Connect loads with no network, and runtime-caches the Google-hosted
 * Inter font + the runtime config. The manifest and Workbox config start from
 * the BASE_* defaults above and are extended by `pwa` — the effective,
 * already-merged PWA overrides from build-time packages and the project's
 * `connect.pwa` block (see mergePwaConfig). Registration is left to the
 * Connect SPA (`serviceWorkerManager`, `injectRegister: null`) rather than the
 * plugin's `virtual:pwa-register` module, so the published
 * `@powerhousedao/connect` tsdown build never has to resolve that virtual
 * import.
 *
 * When disabled, a self-destroying worker is emitted at the same URL so any
 * worker a previous offline-enabled build installed unregisters itself and
 * clears its caches on the browser's next service-worker update check.
 */
export function connectPwaPlugins(options: {
  offlineEnabled: boolean;
  /** Effective PWA overrides (packages + project), already merged. */
  pwa?: PHConnectPwa;
}): PluginOption[] {
  const { offlineEnabled, pwa } = options;

  if (!offlineEnabled) {
    return [
      VitePWA({
        selfDestroying: true,
        strategies: "generateSW",
        injectRegister: null,
        filename: "service-worker.js",
        devOptions: { enabled: false },
      }),
    ];
  }

  const { manifest, workbox } = applyPwaOverrides(
    { manifest: BASE_MANIFEST, workbox: BASE_WORKBOX },
    pwa ?? {},
  );

  return [
    connectPwaIconsPlugin(),
    VitePWA({
      strategies: "generateSW",
      // prompt → Workbox leaves the new worker waiting and emits a SKIP_WAITING
      // message listener; the SPA surfaces a refresh prompt and posts that
      // message when the user accepts (see serviceWorkerManager).
      registerType: "prompt",
      injectRegister: null,
      // Matches nginx's dedicated no-cache location and the SPA's existing
      // registration path.
      filename: "service-worker.js",
      // ph connect dev keeps running without a service worker.
      devOptions: { enabled: false },
      // Icons are emitted by connectPwaIconsPlugin and precached via the png
      // glob, so the plugin must not also try to resolve them from /public.
      includeManifestIcons: false,
      manifest,
      workbox,
    }),
  ];
}
