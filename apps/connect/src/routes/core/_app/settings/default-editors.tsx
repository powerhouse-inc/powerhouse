import { createFileRoute } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import {
  shellProvidesTab,
  shellSettingsTab,
} from "../../../../router/route-components.js";

export const Route = createFileRoute("/_app/settings/default-editors")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  staticData: {
    settings: {
      label: "Default Editors",
      order: 20,
      icon: PenLine,
      enabled: shellProvidesTab("default-editors"),
    },
  },
  component: shellSettingsTab("default-editors"),
});
