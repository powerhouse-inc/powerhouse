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
} from "../clis/types.js";
import { dedupeFileHandlers, dedupeIcons, unionStrings } from "./pwa-config.js";

/**
 * The one route launched files open at, shared by the built-in handler and
 * injected into every contributed one. Not configurable: consuming launched
 * files takes runtime code that lives in Connect itself, and a relative "."
 * resolves against the manifest URL so it tracks any deploy base (the
 * webmanifest is served dynamically and never rewritten by the dynamic-base
 * plugin) — same trick as the base start_url/scope.
 */
export const PWA_FILE_HANDLER_ACTION = ".";

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
  categories?: string[];
  [key: string]: unknown;
}

/**
 * Lay a `PHConnectPwaManifest` fragment over a base web-manifest object.
 *
 * - **scalars** (name, theme_color, launch_handler, …): governed by
 *   `scalarPolicy`. `"fragment-wins"` lets the fragment overwrite the base;
 *   `"base-wins"` keeps the base and only fills fields it left unset. Keys
 *   listed in `protectedScalars` always behave as base-wins even under a
 *   fragment-wins policy — used at runtime to fragment-win cosmetic scalars
 *   while still protecting navigation-critical ones (`start_url`/`scope`) from
 *   an untrusted dynamically-installed package.
 * - **arrays** (icons, file_handlers): always additive, base entries first,
 *   de-duplicated — so a package can extend but never displace a built-in
 *   (Chromium is first-registered-wins per file extension, so `.phd`/`.phdm`
 *   stay Connect's).
 * - **categories**: order-preserving string union (derived from the manifest
 *   `category` field, not authored under `pwa`).
 *
 * The Connect-owned file-handler action is injected idempotently.
 */
export function mergeManifest(
  base: PwaWebManifest,
  fragment: PHConnectPwaManifest | undefined,
  opts?: {
    scalarPolicy?: "base-wins" | "fragment-wins";
    protectedScalars?: readonly string[];
  },
): PwaWebManifest {
  const scalarPolicy = opts?.scalarPolicy ?? "base-wins";
  const protectedScalars = opts?.protectedScalars ?? [];
  const result: PwaWebManifest = { ...base };
  const { icons, file_handlers, categories, ...scalars } = fragment ?? {};

  const takeScalar = (key: string): boolean => {
    // Protected keys stay base-wins regardless of the policy.
    const policy = protectedScalars.includes(key) ? "base-wins" : scalarPolicy;
    return policy === "fragment-wins" || result[key] === undefined;
  };

  for (const [key, value] of Object.entries(scalars)) {
    if (takeScalar(key)) result[key] = value;
  }

  if (icons?.length) {
    result.icons = dedupeIcons([...(result.icons ?? []), ...icons]);
  }
  if (file_handlers?.length) {
    // Force the Connect-owned action (spread first, action last) so contributed
    // handlers match the base's already-injected shape and de-dupe correctly.
    const injected = file_handlers.map((handler) => ({
      ...handler,
      action: PWA_FILE_HANDLER_ACTION,
    }));
    result.file_handlers = dedupeFileHandlers([
      ...(result.file_handlers ?? []),
      ...injected,
    ]);
  }
  if (categories?.length) {
    result.categories = unionStrings(result.categories, categories);
  }

  // Idempotently (re-)assert the Connect-owned file-handler action across the
  // merged result, covering both fragment contributions and any base entries.
  if (result.file_handlers?.length) {
    result.file_handlers = result.file_handlers.map((handler) => ({
      ...handler,
      action: PWA_FILE_HANDLER_ACTION,
    }));
  }

  return result;
}
