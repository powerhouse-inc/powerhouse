import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import {
  shellProvidesTab,
  shellSettingsTab,
} from "../../../../router/route-components.js";

export const Route = createFileRoute("/_app/settings/ai-assistant")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  staticData: {
    settings: {
      label: "AI Assistant",
      order: 0,
      icon: Bot,
      enabled: shellProvidesTab("ai-assistant"),
    },
  },
  component: shellSettingsTab("ai-assistant"),
});
