import { getRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { lazyRouteComponent } from "@tanstack/react-router";
import type * as SettingsModule from "./index.js";

/** Whether the AI assistant is configured. Not connect.config, which a project
 * route importing the tabs would evaluate before the config loads. */
export const aiAssistantEnabled = () =>
  getRuntimeConfig().connect.ai?.assistantEnabled ?? false;

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
