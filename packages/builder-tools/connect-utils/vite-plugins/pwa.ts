import {
  PWA_SHARE_TARGET_ACTION,
  PWA_SHARE_TARGET_INBOX_CACHE,
  type PHConnectPwa,
} from "@powerhousedao/shared/connect";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { connectPwaIconsPlugin } from "./pwa-icons.js";
import {
  applyPwaOverrides,
  FILE_HANDLER_ACTION,
  type ConnectPrecacheOptions,
  type ConnectPwaManifest,
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
 * Connect's hardcoded precache config — the base layer for the `injectManifest`
 * precache. Overridable additively (extra globs) or by raising the size ceiling
 * via package/project `pwa` config. The rest of the old Workbox config
 * (runtime-caching rules with their function urlPatterns, the navigation
 * fallback, clientsClaim/skipWaiting/cleanupOutdatedCaches) now lives as
 * imperative code in the hand-written service worker
 * (../service-worker/service-worker.ts), because `injectManifest` has no
 * declarative runtimeCaching option.
 */
const BASE_PRECACHE: ConnectPrecacheOptions = {
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
  // in the precache either. manifest.webmanifest is added at wiring time so
  // the SW's dynamic manifest route is the sole producer at that URL.
  globIgnores: ["**/powerhouse.config.json", "**/*.map"],
};

const SW_FILENAME = "service-worker.ts";

/**
 * Absolute directory holding the hand-written service-worker source. Resolved
 * relative to THIS module so it works from source
 * (connect-utils/vite-plugins → ../service-worker) and from the bundled dist
 * (dist/index.mjs → ./service-worker, where tsdown copies it). vite-plugin-pwa
 * resolves `swSrc = path.resolve(root, srcDir, filename)`, and `path.resolve`
 * ignores `root` when `srcDir` is absolute — so the SW ships with
 * builder-tools instead of every project needing its own copy.
 */
function resolveServiceWorkerDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../service-worker"), // source layout
    resolve(here, "service-worker"), // bundled dist layout
  ];
  return (
    candidates.find((dir) => existsSync(join(dir, SW_FILENAME))) ??
    candidates[0]
  );
}

/**
 * Virtual module that feeds the hand-written SW its build-time data. Passed
 * into vite-plugin-pwa's SEPARATE injectManifest build via
 * `injectManifest.buildPlugins.vite`: that build runs with `configFile: false`,
 * so the app's own plugins aren't present, but buildPlugins (and `define`) are.
 */
function phSwConfigPlugin(data: Record<string, unknown>): Plugin {
  const virtualId = "virtual:ph-sw-config";
  const resolvedId = `\0${virtualId}`;
  return {
    name: "ph-sw-config",
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      return Object.entries(data)
        .map(
          ([key, value]) => `export const ${key} = ${JSON.stringify(value)};`,
        )
        .join("\n");
    },
  };
}

/**
 * Service-worker / PWA support for Connect, gated by `connect.app.offline`.
 *
 * When enabled (the default), Workbox `injectManifest` bundles Connect's
 * hand-written service worker (../service-worker/service-worker.ts), which
 * precaches the built app shell so Connect loads with no network, runtime-
 * caches the Google-hosted Inter font + the registry CDN + the runtime config,
 * AND serves a dynamic web-app manifest so packages installed AT RUNTIME can
 * extend it (their fragments are mirrored into IndexedDB by the SPA; the base
 * the SW merges onto is embedded here at build time). The manifest and precache
 * config start from the BASE_* defaults above and are extended by `pwa` — the
 * effective, already-merged overrides from build-time packages and the
 * project's `connect.pwa` block (see mergePwaConfig). Registration is left to
 * the Connect SPA (`serviceWorkerManager`, `injectRegister: null`).
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

  const { manifest, precache } = applyPwaOverrides(
    { manifest: BASE_MANIFEST, precache: BASE_PRECACHE },
    pwa ?? {},
  );

  // Build-time data handed to the SW via the virtual module. EMBEDDED_BASE_
  // MANIFEST is the base the runtime manifest route merges dynamically-
  // installed package fragments onto; the two EXTRA_* arrays are the
  // serialisable build-time contributions the SW registers after its built-ins.
  const swConfig = {
    EMBEDDED_BASE_MANIFEST: manifest,
    EXTRA_RUNTIME_CACHING: pwa?.runtimeCaching ?? [],
    NAVIGATE_FALLBACK_DENYLIST_EXTRA: pwa?.navigateFallbackDenylist ?? [],
    SHARE_TARGET_ACTION: PWA_SHARE_TARGET_ACTION,
    SHARE_TARGET_INBOX_CACHE: PWA_SHARE_TARGET_INBOX_CACHE,
  };

  return [
    connectPwaIconsPlugin(),
    VitePWA({
      strategies: "injectManifest",
      // Absolute srcDir → swSrc is builder-tools' own SW source; the emitted
      // file is service-worker.js (vite-plugin-pwa maps the .ts source).
      srcDir: resolveServiceWorkerDir(),
      filename: SW_FILENAME,
      // prompt → the new worker waits; the SPA surfaces a refresh prompt and
      // posts SKIP_WAITING when the user accepts (see serviceWorkerManager).
      registerType: "prompt",
      injectRegister: null,
      // ph connect dev keeps running without a service worker.
      devOptions: { enabled: false },
      // Icons are emitted by connectPwaIconsPlugin and precached via the png
      // glob, so the plugin must not also try to resolve them from /public.
      includeManifestIcons: false,
      // Still emitted as the static base/offline fallback + the <link>.
      manifest,
      injectManifest: {
        globPatterns: precache.globPatterns,
        // Exclude the webmanifest from precache so the SW's dynamic route is
        // the sole producer at that URL.
        globIgnores: [...precache.globIgnores, "**/manifest.webmanifest"],
        maximumFileSizeToCacheInBytes: precache.maximumFileSizeToCacheInBytes,
        buildPlugins: { vite: [phSwConfigPlugin(swConfig)] },
      },
    }),
  ];
}
