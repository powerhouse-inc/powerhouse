import { createFileRoute } from "@tanstack/react-router";
import { coreView } from "@powerhousedao/connect-core/router";

/** The tab's options: its entry in the settings page. */
export const options = {
  staticData: { settings: { label: "Packages", order: 50 } },
};

// The loaded packages, their document models and editors.
export const Route = createFileRoute("/_app/settings/packages")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("PackagesTab"),
});
