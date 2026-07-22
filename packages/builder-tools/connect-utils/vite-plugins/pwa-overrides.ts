import {
  mergeManifest,
  PWA_FILE_HANDLER_ACTION,
  unionStrings,
  type PHConnectPwa,
  type PwaWebManifest,
} from "@powerhousedao/shared/connect";
import type { ManifestOptions } from "vite-plugin-pwa";

// Applies the effective (already merged, see mergePwaConfig) serialisable PWA
// fragment onto Connect's hardcoded base. The manifest merge is delegated to
// the browser-safe `mergeManifest` in @powerhousedao/shared/connect so the
// exact same code shapes the manifest here (build time) and inside the service
// worker (runtime, for dynamically-installed packages). This module only adds
// the vite-plugin-pwa manifest TYPES and the precache-glob merge; the Workbox
// runtime-caching / navigation behaviour now lives in the hand-written service
// worker (see connect-utils/service-worker/service-worker.ts), because
// `injectManifest` has no declarative runtimeCaching option.

// Re-exported so existing importers (pwa.ts, the e2e test) keep a stable name
// while the constant's source of truth moves to @powerhousedao/shared/connect.
export { PWA_FILE_HANDLER_ACTION as FILE_HANDLER_ACTION };

/** A manifest file-handler entry. vite-plugin-pwa's own type stops at
 * `{ action; accept }`; the spec'd `icons`/`launch_type` members are added
 * here — the manifest is emitted as verbatim JSON, so they ship through. */
export type ConnectPwaFileHandler = NonNullable<
  ManifestOptions["file_handlers"]
>[number] & {
  icons?: ManifestOptions["icons"];
  launch_type?: "single-client" | "multiple-clients";
};

/** The web-app manifest exactly as VitePWA accepts it, with the file-handler
 * entries widened to their full spec'd shape. */
export type ConnectPwaManifest = Omit<
  Partial<ManifestOptions>,
  "file_handlers"
> & {
  file_handlers?: ConnectPwaFileHandler[];
};

/** The precache-driving subset of the old Workbox config. Under injectManifest
 * these are the `injectManifest` options; `self.__WB_MANIFEST` is generated
 * from them. Everything else (runtimeCaching, navigation, clientsClaim, …) is
 * imperative code in the service worker. */
export type ConnectPrecacheOptions = {
  globPatterns: string[];
  globIgnores: string[];
  maximumFileSizeToCacheInBytes: number;
};

/**
 * Lay an effective PWA fragment over the plugin's hardcoded manifest + precache
 * base. The manifest is merged by the shared `mergeManifest` with
 * `fragment-wins` scalars (the build-time effective config is the authority);
 * icons and file handlers concatenate after the base set (contributed handlers
 * get Connect's fixed action injected — the open route is not configurable);
 * globs union; the size ceiling takes the max.
 *
 * The serialisable `runtimeCaching` / `navigateFallbackDenylist` overrides are
 * NOT handled here — they are passed straight to the service worker (which
 * registers them after its built-in rules), because injectManifest has no
 * declarative runtimeCaching and Workbox is first-match-wins, so an override
 * can only be appended after the built-ins (intentional for v1).
 */
export function applyPwaOverrides(
  base: { manifest: ConnectPwaManifest; precache: ConnectPrecacheOptions },
  override: PHConnectPwa,
): { manifest: ConnectPwaManifest; precache: ConnectPrecacheOptions } {
  const manifest = mergeManifest(
    base.manifest as PwaWebManifest,
    override.manifest,
    { scalarPolicy: "fragment-wins" },
  ) as ConnectPwaManifest;

  const precache: ConnectPrecacheOptions = {
    globPatterns: override.globPatterns?.length
      ? unionStrings(base.precache.globPatterns, override.globPatterns)
      : base.precache.globPatterns,
    globIgnores: override.globIgnores?.length
      ? unionStrings(base.precache.globIgnores, override.globIgnores)
      : base.precache.globIgnores,
    maximumFileSizeToCacheInBytes:
      typeof override.maximumFileSizeToCacheInBytes === "number"
        ? Math.max(
            base.precache.maximumFileSizeToCacheInBytes,
            override.maximumFileSizeToCacheInBytes,
          )
        : base.precache.maximumFileSizeToCacheInBytes,
  };

  return { manifest, precache };
}
