import { genericActive, settingsTab } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";
import { PenLine } from "lucide-react";

export const options = {
  staticData: {
    settings: {
      label: "Default Editors",
      order: 20,
      icon: PenLine,
      enabled: genericActive,
    },
  },
};

export const Route = createFileRoute("/_app/settings/default-editors")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: settingsTab("DefaultEditor"),
});
