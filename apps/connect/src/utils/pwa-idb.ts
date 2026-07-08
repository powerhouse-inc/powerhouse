import {
  PWA_IDB_KEY,
  PWA_IDB_NAME,
  PWA_IDB_STORE,
  PWA_IDB_VERSION,
  type PHConnectPwa,
  type PHConnectPwaIcon,
} from "@powerhousedao/shared/connect";

// The page-owned mirror of the effective PWA fragment contributed by the
// currently-installed packages. The service worker reads this (read-only) to
// serve a live web-app manifest — a SW cannot reach localStorage (where the
// package list lives), so BrowserPackageManager writes the merged fragment
// here on every package change. The db/store/key/version constants are the
// SHARED source of truth in @powerhousedao/shared/connect, imported by both
// this writer and the SW reader so the two cannot desync.

export type PwaFragmentRecord = {
  version: 1;
  fragment: PHConnectPwa;
  updatedAt: number;
};

// Self-contained IDB open (not reusing pglite-idb) so this module — and its
// pure `resolveFragmentAssetUrls` — carries no dependency on connect.config,
// keeping it importable in isolation.
function openPwaIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PWA_IDB_NAME, PWA_IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PWA_IDB_STORE)) {
        req.result.createObjectStore(PWA_IDB_STORE);
      }
    };
    req.onerror = () => reject(req.error ?? new Error("ph-pwa open failed"));
    req.onblocked = () => reject(new Error("ph-pwa open blocked"));
    req.onsuccess = () => resolve(req.result);
  });
}

/** Write (replace) the single merged fragment record. Best-effort: a failure to
 * mirror the manifest must never break package installation, so callers ignore
 * rejections. No-op when IndexedDB is unavailable (SSR/tests). */
export async function writeMergedPwaFragment(
  fragment: PHConnectPwa,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openPwaIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PWA_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("PWA fragment write failed"));
      tx.objectStore(PWA_IDB_STORE).put(
        {
          version: 1,
          fragment,
          updatedAt: Date.now(),
        } satisfies PwaFragmentRecord,
        PWA_IDB_KEY,
      );
    });
  } finally {
    db.close();
  }
}

/** Resolve `src` against the package `baseUrl`, absolute srcs passing through.
 * `baseUrl` may itself be relative (e.g. a same-origin-proxied registry, or the
 * dev `/node_modules/…` path), so it is first made absolute against the app
 * origin — `new URL(src, relativeBase)` would otherwise throw and silently
 * leave the src unresolved. A malformed src is left untouched. */
function toAbsoluteAssetUrl(src: string, baseUrl: string): string {
  try {
    const origin =
      typeof location !== "undefined" ? location.href : "http://localhost/";
    return new URL(src, new URL(baseUrl, origin)).toString();
  } catch {
    return src;
  }
}

function resolveIconSrc(
  icon: PHConnectPwaIcon,
  baseUrl: string,
): PHConnectPwaIcon {
  return { ...icon, src: toAbsoluteAssetUrl(icon.src, baseUrl) };
}

/**
 * Rewrite a package fragment's relative asset srcs (manifest icons,
 * file-handler icons, shortcut icons, screenshots) to absolute URLs against the
 * package's base — a runtime package's assets live on the registry CDN, not the
 * app origin, so the served manifest must point there. `baseUrl` null (a
 * local/bundled package whose assets are app-origin-relative) leaves srcs
 * untouched.
 */
export function resolveFragmentAssetUrls(
  config: PHConnectPwa,
  baseUrl: string | null,
): PHConnectPwa {
  if (!baseUrl || !config.manifest) return config;
  const m = config.manifest;
  const resolveIcons = (icons?: PHConnectPwaIcon[]) =>
    icons?.map((icon) => resolveIconSrc(icon, baseUrl));
  return {
    ...config,
    manifest: {
      ...m,
      icons: resolveIcons(m.icons),
      file_handlers: m.file_handlers?.map((handler) => ({
        ...handler,
        icons: resolveIcons(handler.icons),
      })),
      shortcuts: m.shortcuts?.map((shortcut) => ({
        ...shortcut,
        icons: resolveIcons(shortcut.icons),
      })),
      screenshots: m.screenshots?.map((shot) => ({
        ...shot,
        src: toAbsoluteAssetUrl(shot.src, baseUrl),
      })),
    },
  };
}
