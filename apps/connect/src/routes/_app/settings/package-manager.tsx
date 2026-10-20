import { genericActive, settingsTab } from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

export const options = {
  staticData: {
    settings: {
      label: "Package Manager",
      order: 10,
      icon: Package,
      enabled: genericActive,
    },
  },
};

export const Route = createFileRoute("/_app/settings/package-manager")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: settingsTab("ConnectPackageManager"),
});
