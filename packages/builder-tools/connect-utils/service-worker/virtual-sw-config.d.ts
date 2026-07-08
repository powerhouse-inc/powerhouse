// Ambient types for the build-time-generated virtual module the service worker
// imports. The concrete values are supplied by `phSwConfigPlugin` (see
// ../vite-plugins/pwa.ts), which resolves `virtual:ph-sw-config` during
// vite-plugin-pwa's injectManifest build pass.
declare module "virtual:ph-sw-config" {
  import type {
    PHConnectPwaRuntimeCaching,
    PHConnectPwaUrlPattern,
  } from "@powerhousedao/shared/connect";

  /** The build-effective web-app manifest (Connect base + build-time package
   * fragments + project config), the base the runtime manifest route merges
   * dynamically-installed package fragments onto. */
  export const EMBEDDED_BASE_MANIFEST: Record<string, unknown>;

  /** Serialisable runtime-caching rules contributed at build time, registered
   * after the built-in rules. */
  export const EXTRA_RUNTIME_CACHING: PHConnectPwaRuntimeCaching[];

  /** Extra SPA navigate-fallback denylist patterns. */
  export const NAVIGATE_FALLBACK_DENYLIST_EXTRA: PHConnectPwaUrlPattern[];

  /** The in-scope path the OS share sheet POSTs to (Connect-owned). */
  export const SHARE_TARGET_ACTION: string;

  /** Cache name the SW stashes shared files under for the SPA to drain. */
  export const SHARE_TARGET_INBOX_CACHE: string;
}
