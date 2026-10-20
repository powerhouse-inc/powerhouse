import { options } from "@powerhousedao/connect-core/routes/_app";
import { coreView } from "@powerhousedao/connect-core/router";
import { AppLayout, generic } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// The sidebar beside the content; core's header without the generic plugin.
export const Route = createFileRoute("/_app")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: generic(() => <AppLayout />, coreView("CoreLayout")),
});
