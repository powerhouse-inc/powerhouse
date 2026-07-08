// Building the effective web-app manifest from a base manifest plus a
// `PHConnectPwaManifest` fragment. Pure JSON in / JSON out — no PWA-toolchain
// or DOM dependency — so the SAME code path runs at build time (laying the
// effective build-merged fragment over Connect's hardcoded base, see
// applyPwaOverrides) and at runtime inside the service worker (laying a
// dynamically-installed package's fragment over the build-embedded base to
// serve the live manifest).
//
// Connect owns the "where" of every OS integration: file handlers open at the
// app root, `web+…` protocol links and shared files route through fixed
// in-scope endpoints. Contributors declare only WHAT they accept; the routes
// below are injected here so a package can never point the OS at an arbitrary
// URL. Injection is idempotent, so re-merging a manifest that already carries
// the routes is a no-op.

import type {
  PHConnectPwaFileHandler,
  PHConnectPwaIcon,
  PHConnectPwaManifest,
  PHConnectPwaProtocolHandler,
  PHConnectPwaScreenshot,
  PHConnectPwaShareTarget,
  PHConnectPwaShortcut,
} from "../clis/types.js";
import {
  dedupeFileHandlers,
  dedupeIcons,
  dedupeProtocolHandlers,
  dedupeScreenshots,
  dedupeShortcuts,
  unionStrings,
} from "./pwa-config.js";

/**
 * The one route launched files open at, shared by the built-in handler and
 * injected into every contributed one. Not configurable: consuming launched
 * files takes runtime code that lives in Connect itself, and a relative "."
 * resolves against the manifest URL so it tracks any deploy base (the
 * webmanifest is served dynamically and never rewritten by the dynamic-base
 * plugin) — same trick as the base start_url/scope.
 */
export const PWA_FILE_HANDLER_ACTION = ".";

/**
 * The in-scope URL template every contributed protocol handler is pointed at.
 * The `%s` placeholder receives the full `web+…://…` link; Connect's own
 * runtime handler (see the SPA boot) parses `?ph-protocol=`. Relative so it
 * tracks the deploy base, like the file-handler action.
 */
export const PWA_PROTOCOL_HANDLER_URL = "./?ph-protocol=%s";

/**
 * The in-scope endpoint the OS share sheet POSTs to. Handled by Connect's
 * service worker (stash-and-redirect), not a real navigable page. Relative so
 * it tracks the deploy base.
 */
export const PWA_SHARE_TARGET_ACTION = "share-target";

/** Cache the service worker stashes OS-shared files under; the SPA drains it on
 * boot. Kept here so the SW config, the SW itself and the SPA reader agree. */
export const PWA_SHARE_TARGET_INBOX_CACHE = "ph-share-inbox";

/** URL marker the share-target route redirects to, so the SPA knows to drain
 * the inbox on the next load. */
export const PWA_SHARE_TARGET_REDIRECT_PARAM = "ph-share-target";

/** Query param a protocol-handler launch arrives with (the full `web+…://…`
 * link is the value). */
export const PWA_PROTOCOL_LAUNCH_PARAM = "ph-protocol";

// IndexedDB schema for the page->service-worker PWA-fragment mirror. A SW can't
// read localStorage (where the installed-package list lives), so the SPA
// mirrors the merged fragment here and the SW reads it to serve a live
// manifest. Both sides MUST agree, so the schema lives here as the single
// source of truth (the SPA writer and the SW reader both import these) —
// a rename or version bump can no longer desync one side silently.
export const PWA_IDB_NAME = "ph-pwa";
export const PWA_IDB_STORE = "fragments";
export const PWA_IDB_KEY = "merged";
export const PWA_IDB_VERSION = 1;

/** The subset of a web-app manifest this module reads/writes, plus an index
 * signature so untouched fields (name, theme_color, launch_handler, …) pass
 * through verbatim. */
export interface PwaWebManifest {
  icons?: PHConnectPwaIcon[];
  file_handlers?: (PHConnectPwaFileHandler & { action?: string })[];
  protocol_handlers?: (PHConnectPwaProtocolHandler & { url?: string })[];
  screenshots?: PHConnectPwaScreenshot[];
  shortcuts?: PHConnectPwaShortcut[];
  categories?: string[];
  display_override?: string[];
  // The served shape: contributor's params plus Connect's injected
  // action/method/enctype (see withShareTargetAction).
  share_target?: PHConnectPwaShareTarget & {
    action?: string;
    method?: string;
    enctype?: string;
  };
  [key: string]: unknown;
}

/** Injected share-target shape. Connect owns the endpoint AND the transport:
 * its service-worker route only handles a POST (reading `formData`), so method
 * and enctype are fixed here rather than declared by the contributor (which is
 * why `PHConnectPwaShareTarget` has no method/enctype — same principle as the
 * Connect-owned `action`). enctype is multipart when files are accepted. */
function withShareTargetAction(
  target: PHConnectPwaShareTarget,
): PwaWebManifest["share_target"] {
  const hasFiles = (target.params.files?.length ?? 0) > 0;
  return {
    action: PWA_SHARE_TARGET_ACTION,
    method: "POST",
    enctype: hasFiles
      ? "multipart/form-data"
      : "application/x-www-form-urlencoded",
    params: target.params,
  };
}

/**
 * Lay a `PHConnectPwaManifest` fragment over a base web-manifest object.
 *
 * - **scalars** (name, theme_color, launch_handler, …): governed by
 *   `scalarPolicy`. `"fragment-wins"` (build time — the effective config is the
 *   authority) lets the fragment overwrite the base; `"base-wins"` (runtime —
 *   the fragment is an untrusted dynamically-installed package) keeps Connect's
 *   identity and only fills fields the base left unset.
 * - **arrays** (icons, file_handlers, shortcuts, protocol_handlers,
 *   screenshots): always additive, base entries first, de-duplicated — so a
 *   package can extend but never displace a built-in (Chromium is
 *   first-registered-wins per file extension, so `.phd`/`.phdm` stay Connect's).
 * - **categories / display_override**: order-preserving string union.
 * - **share_target**: singular; treated as a scalar for `scalarPolicy`.
 *
 * Connect-owned routes are injected into every file handler, protocol handler
 * and the share target, idempotently.
 */
export function mergeManifest(
  base: PwaWebManifest,
  fragment: PHConnectPwaManifest | undefined,
  opts?: { scalarPolicy?: "base-wins" | "fragment-wins" },
): PwaWebManifest {
  const scalarPolicy = opts?.scalarPolicy ?? "base-wins";
  const result: PwaWebManifest = { ...base };
  const {
    icons,
    file_handlers,
    shortcuts,
    protocol_handlers,
    screenshots,
    categories,
    display_override,
    share_target,
    ...scalars
  } = fragment ?? {};

  const takeScalar = (key: string): boolean =>
    scalarPolicy === "fragment-wins" || result[key] === undefined;

  for (const [key, value] of Object.entries(scalars)) {
    if (takeScalar(key)) result[key] = value;
  }
  if (share_target !== undefined && takeScalar("share_target")) {
    result.share_target = share_target;
  }

  if (icons?.length) {
    result.icons = dedupeIcons([...(result.icons ?? []), ...icons]);
  }
  if (file_handlers?.length) {
    // Force the Connect-owned action (spread first, action last) so contributed
    // handlers match the base's already-injected shape and de-dupe correctly —
    // same normalization as protocol_handlers below.
    const injected = file_handlers.map((handler) => ({
      ...handler,
      action: PWA_FILE_HANDLER_ACTION,
    }));
    result.file_handlers = dedupeFileHandlers([
      ...(result.file_handlers ?? []),
      ...injected,
    ]);
  }
  if (shortcuts?.length) {
    result.shortcuts = dedupeShortcuts([
      ...(result.shortcuts ?? []),
      ...shortcuts,
    ]);
  }
  if (protocol_handlers?.length) {
    const injected = protocol_handlers.map((handler) => ({
      ...handler,
      url: PWA_PROTOCOL_HANDLER_URL,
    }));
    result.protocol_handlers = dedupeProtocolHandlers([
      ...(result.protocol_handlers ?? []),
      ...injected,
    ]);
  }
  if (screenshots?.length) {
    result.screenshots = dedupeScreenshots([
      ...(result.screenshots ?? []),
      ...screenshots,
    ]);
  }
  if (categories?.length) {
    result.categories = unionStrings(result.categories, categories);
  }
  if (display_override?.length) {
    result.display_override = unionStrings(
      result.display_override,
      display_override,
    );
  }

  // Idempotently (re-)assert Connect-owned routes across the merged result,
  // covering both fragment contributions and any base entries.
  if (result.file_handlers?.length) {
    result.file_handlers = result.file_handlers.map((handler) => ({
      ...handler,
      action: PWA_FILE_HANDLER_ACTION,
    }));
  }
  if (result.protocol_handlers?.length) {
    result.protocol_handlers = result.protocol_handlers.map((handler) => ({
      ...handler,
      url: PWA_PROTOCOL_HANDLER_URL,
    }));
  }
  if (result.share_target) {
    result.share_target = withShareTargetAction(result.share_target);
  }

  return result;
}
