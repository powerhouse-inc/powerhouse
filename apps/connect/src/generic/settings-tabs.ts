import type {
  ConnectRoutes,
  ConnectSettingsTab,
} from "@powerhousedao/connect-core/router";
import type { AnyRoute } from "@tanstack/react-router";
import { createRoute } from "@tanstack/react-router";
import { Bot, CircleHelp, Package, PenLine, TriangleAlert } from "lucide-react";
import { aiAssistantEnabled, settingsTab } from "./settings/tabs.js";

const tab = (settings: ConnectSettingsTab) => ({ staticData: { settings } });

/** The generic plugin's settings tabs by path: each tab's route options, which a
 * project file at that path spreads to replace the tab's view. */
export const genericSettingsTabs = {
  "ai-assistant": tab({
    label: "AI Assistant",
    order: 0,
    icon: Bot,
    enabled: aiAssistantEnabled,
  }),
  "package-manager": tab({
    label: "Package Manager",
    order: 10,
    icon: Package,
  }),
  "default-editors": tab({
    label: "Default Editors",
    order: 20,
    icon: PenLine,
  }),
  "danger-zone": tab({
    label: "Danger Zone",
    order: 80,
    icon: TriangleAlert,
    destructive: true,
  }),
  about: tab({ label: "About", order: 90, icon: CircleHelp }),
};

type GenericSettingsTab = keyof typeof genericSettingsTabs;

const VIEWS: Record<GenericSettingsTab, Parameters<typeof settingsTab>[0]> = {
  "ai-assistant": "AiAssistant",
  "package-manager": "ConnectPackageManager",
  "default-editors": "DefaultEditor",
  "danger-zone": "DangerZone",
  about: "About",
};

/** The generic settings tabs, under the settings route. */
export function settingsTabRoutes({ settingsRoute }: ConnectRoutes) {
  return Object.entries(genericSettingsTabs).map(([path, options]) =>
    createRoute({
      getParentRoute: () => settingsRoute,
      path,
      ...options,
      component: settingsTab(VIEWS[path as GenericSettingsTab]),
    }),
  ) as AnyRoute[];
}
