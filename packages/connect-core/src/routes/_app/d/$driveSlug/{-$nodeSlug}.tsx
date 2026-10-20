// By package name: a project's build shares the module Connect uses, and its
// declarations can name the types.
import type {
  ConnectRouterContext,
  DriveLoaderOptions,
  DriveRouteData,
} from "@powerhousedao/connect-core/router";
import {
  coreView,
  DRIVE_PENDING_MS,
  DrivePending,
  driveTitle,
  loadNode,
  validateDriveSearch,
} from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

/** The node route's options: its loader, `?history` search and title. */
export const options = {
  // `?history` and its `historyPage`; inline type, as in __root.tsx.
  validateSearch: (search: Record<string, unknown>) =>
    validateDriveSearch(search) as Record<string, string | undefined>,
  loader: {
    handler: (options: DriveLoaderOptions): Promise<DriveRouteData> =>
      loadNode(options),
    // A reused match re-resolves before it shows; drives may have changed.
    staleReloadMode: "blocking" as const,
  },
  // Only a path change re-resolves; search-only and same-URL navigations stay.
  shouldReload: ({ cause }: { cause: "preload" | "enter" | "stay" }) =>
    cause !== "stay",
  preloadStaleTime: 0,
  pendingMs: DRIVE_PENDING_MS,
  pendingMinMs: 0,
  pendingComponent: DrivePending,
  // Names from the store; bindConnectRouter re-runs this when they change.
  head: ({
    match,
    loaderData,
  }: {
    match: { context: ConnectRouterContext };
    loaderData?: DriveRouteData;
  }) => ({
    meta: [
      {
        title: driveTitle(
          match.context.store,
          loaderData,
          match.context.appName,
        ),
      },
    ],
  }),
};

// The open document: its history, editor or JSON. Nothing on a folder or the drive's root.
export const Route = createFileRoute("/_app/d/$driveSlug/{-$nodeSlug}")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("NodeView"),
});
