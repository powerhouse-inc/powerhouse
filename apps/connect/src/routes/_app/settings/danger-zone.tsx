import { genericActive, settingsTab } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export const options = {
  staticData: {
    settings: {
      label: "Danger Zone",
      order: 80,
      icon: TriangleAlert,
      destructive: true,
      enabled: genericActive,
    },
  },
};

export const Route = createFileRoute("/_app/settings/danger-zone")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: settingsTab("DangerZone"),
});
