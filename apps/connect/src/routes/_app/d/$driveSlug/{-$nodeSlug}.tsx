import { options } from "@powerhousedao/connect-core/routes/_app/d/$driveSlug/{-$nodeSlug}";
import { coreView, DrivePending } from "@powerhousedao/connect-core/router";
import {
  DrivePending as ConnectDrivePending,
  generic,
  NodeView,
} from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// The open document's editor; core's document view without the generic plugin.
export const Route = createFileRoute("/_app/d/$driveSlug/{-$nodeSlug}")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  pendingComponent: generic(ConnectDrivePending, DrivePending),
  component: generic(NodeView, coreView("NodeView")),
});
