import {
  aiAssistantEnabled,
  genericActive,
  settingsTab,
} from "@powerhousedao/connect/route-views";
import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";

export const options = {
  staticData: {
    settings: {
      label: "AI Assistant",
      order: 0,
      icon: Bot,
      enabled: () => genericActive() && aiAssistantEnabled(),
    },
  },
};

export const Route = createFileRoute("/_app/settings/ai-assistant")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: settingsTab("AiAssistant"),
});
