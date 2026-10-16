import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import {
  shellProvidesTab,
  shellSettingsTab,
} from "../../../../router/route-components.js";

export const Route = createFileRoute("/_app/settings/danger-zone")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  staticData: {
    settings: {
      label: "Danger Zone",
      order: 80,
      icon: TriangleAlert,
      destructive: true,
      enabled: shellProvidesTab("danger-zone"),
    },
  },
  component: shellSettingsTab("danger-zone"),
});
