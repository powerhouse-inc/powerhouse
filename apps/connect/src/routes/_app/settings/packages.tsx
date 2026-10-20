import { options } from "@powerhousedao/connect-core/routes/_app/settings/packages";
import { coreView } from "@powerhousedao/connect-core/router";
import { genericActive } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's tab; the generic plugin has its Package Manager instead.
export const Route = createFileRoute("/_app/settings/packages")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  staticData: {
    settings: {
      ...options.staticData.settings,
      enabled: () => !genericActive(),
    },
  },
  component: coreView("PackagesTab"),
});
