import { createFileRoute } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import {
  shellProvidesTab,
  shellSettingsTab,
} from "../../../../router/route-components.js";

export const Route = createFileRoute("/_app/settings/about")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  staticData: {
    settings: {
      label: "About",
      order: 90,
      icon: CircleHelp,
      enabled: shellProvidesTab("about"),
    },
  },
  component: shellSettingsTab("about"),
});
