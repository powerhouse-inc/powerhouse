import { options } from "@powerhousedao/connect-core/routes/_app/settings";
import { coreView } from "@powerhousedao/connect-core/router";
import { generic, SettingsPage } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Connect's settings dialog; core's page without the generic plugin.
export const Route = createFileRoute("/_app/settings")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: generic(SettingsPage, coreView("CoreSettingsPage")),
});
