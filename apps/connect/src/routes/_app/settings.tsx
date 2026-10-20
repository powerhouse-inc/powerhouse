import { options } from "@powerhousedao/connect-core/routes/_app/settings";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's settings page; the generic plugin's settings dialog replaces it.
export const Route = createFileRoute("/_app/settings")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("CoreSettingsPage"),
});
