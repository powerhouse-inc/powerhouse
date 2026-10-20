import { createFileRoute } from "@tanstack/react-router";
import { coreView } from "@powerhousedao/connect-core/router";

/** The tab's options: its entry in the settings page. */
export const options = {
  staticData: { settings: { label: "Appearance", order: 30 } },
};

// The theme.
export const Route = createFileRoute("/_app/settings/appearance")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("AppearanceTab"),
});
