import { options } from "@powerhousedao/connect-core/routes/_app/settings/appearance";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's theme tab; the generic plugin hides it.
export const Route = createFileRoute("/_app/settings/appearance")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("AppearanceTab"),
});
