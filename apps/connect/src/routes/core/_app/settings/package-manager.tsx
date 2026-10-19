import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import {
  shellProvidesTab,
  shellSettingsTab,
} from "../../../../router/route-components.js";

export const Route = createFileRoute("/_app/settings/package-manager")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  staticData: {
    settings: {
      label: "Package Manager",
      order: 10,
      icon: Package,
      enabled: shellProvidesTab("package-manager"),
    },
  },
  component: shellSettingsTab("package-manager"),
});
