import { options } from "@powerhousedao/connect-core/routes/_app/d/$driveSlug/{-$nodeSlug}";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's document view; the generic plugin's editor replaces it.
export const Route = createFileRoute("/_app/d/$driveSlug/{-$nodeSlug}")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("NodeView"),
});
