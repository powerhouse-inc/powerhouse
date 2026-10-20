import { connectConfig } from "@powerhousedao/connect/config";
import { lazyRouteComponent } from "@tanstack/react-router";
import type * as SettingsModule from "./index.js";

/** Whether the AI assistant is configured. */
export const aiAssistantEnabled = () => connectConfig.aiAssistantEnabled;

// Loaded with the settings page, not with the app; the router preloads it on intent.
const settings = () => import("./index.js");

/** Connect's settings page around the shown tab. */
export const SettingsPage = lazyRouteComponent(settings, "SettingsPage");

/** One of Connect's settings tabs. */
export function settingsTab(
  name: Exclude<keyof typeof SettingsModule, "SettingsPage">,
) {
  return lazyRouteComponent(settings, name);
}
