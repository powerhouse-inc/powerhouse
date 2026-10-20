import { options } from "@powerhousedao/connect-core/routes/_app/index";
import { coreView } from "@powerhousedao/connect-core/router";
import { generic, Home } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// The drives as cards; core's index without the generic plugin.
export const Route = createFileRoute("/_app/")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: generic(Home, coreView("DriveIndex")),
});
