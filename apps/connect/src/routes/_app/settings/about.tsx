import { genericActive, settingsTab } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";

export const options = {
  staticData: {
    settings: {
      label: "About",
      order: 90,
      icon: CircleHelp,
      enabled: genericActive,
    },
  },
};

export const Route = createFileRoute("/_app/settings/about")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: settingsTab("About"),
});
