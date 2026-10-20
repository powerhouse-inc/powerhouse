import { options } from "@powerhousedao/connect-core/routes/_app/d/$driveSlug";
import { coreView, DrivePending } from "@powerhousedao/connect-core/router";
import {
  DrivePending as ConnectDrivePending,
  DriveLayout,
  generic,
} from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// The drive app around the open document; core's listing without the generic plugin.
export const Route = createFileRoute("/_app/d/$driveSlug")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  pendingComponent: generic(ConnectDrivePending, DrivePending),
  component: generic(DriveLayout, coreView("DriveLayout")),
});
