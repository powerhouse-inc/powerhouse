// By package name: a project's build shares the module Connect uses, and its
// declarations can name the types.
import type { DriveLoaderOptions } from "@powerhousedao/connect-core/router";
import {
  coreView,
  DRIVE_PENDING_MS,
  DrivePending,
  loadDrive,
} from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

/** The drive layout's options: its loader and pending view. */
export const options = {
  loader: {
    handler: (options: DriveLoaderOptions) => loadDrive(options),
    // A reused match re-resolves before it shows; drives may have changed.
    staleReloadMode: "blocking" as const,
  },
  // Only a path change re-resolves; search-only and same-URL navigations stay.
  shouldReload: ({ cause }: { cause: "preload" | "enter" | "stay" }) =>
    cause !== "stay",
  preloadStaleTime: 0,
  pendingMs: DRIVE_PENDING_MS,
  // The pending view is empty on warm navigations; the router's 500 ms default
  // would hold their commit.
  pendingMinMs: 0,
  pendingComponent: DrivePending,
};

// The drive app the drive names, else a directory listing, around the node route.
export const Route = createFileRoute("/_app/d/$driveSlug")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("DriveLayout"),
});
