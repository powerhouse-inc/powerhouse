// Types by package name, so a project's declarations can name them.
import type { DriveRouteData } from "@powerhousedao/connect/router";
import { createFileRoute } from "@tanstack/react-router";
import { loadDriveRoute } from "../../../../../../router/drive-route-loader.js";
import {
  DRIVE_PENDING_MS,
  DrivePendingView,
} from "../../../../../../router/route-components.js";
import { driveTitle } from "../../../../../../router/titles.js";

export const Route = createFileRoute(
  "/_app/_content/d/$driveSlug/{-$nodeSlug}",
)({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  loader: {
    handler: ({
      params,
      context,
      abortController,
      preload,
    }): Promise<DriveRouteData> =>
      loadDriveRoute({
        params,
        context,
        signal: abortController.signal,
        preload,
      }),
    // A reused match re-resolves before it shows; drives may have changed.
    staleReloadMode: "blocking",
  },
  // Only a path change re-resolves; search-only and same-URL navigations stay.
  shouldReload: ({ cause }) => cause !== "stay",
  preloadStaleTime: 0,
  pendingMs: DRIVE_PENDING_MS,
  // The pending view is empty on warm navigations; the router's 500 ms default
  // would hold their commit.
  pendingMinMs: 0,
  // Names from the store; bindConnectRouter re-runs this when they change.
  head: ({ match, loaderData }) => ({
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
  pendingComponent: DrivePendingView,
});
