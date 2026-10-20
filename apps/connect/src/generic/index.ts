// Connect's generic building blocks, for a project's own routes and layout. With
// core's (`@powerhousedao/connect/layout`), so a layout imports from one place.
export * from "@powerhousedao/connect/layout";
export { AppLayout } from "./layout/app-layout.js";
export type { AppLayoutProps } from "./layout/app-layout.js";
export { DrivePending } from "./layout/route-views.js";
export {
  Sidebar as ConnectSidebar,
  SidebarDriveItems,
  SidebarNavItems,
} from "./layout/sidebar.js";
export type { SidebarProps as ConnectSidebarProps } from "./layout/sidebar.js";
export { OpenDocument } from "./editors/open-document.js";
export { DriveLayout, Home, NodeView } from "./pages/content.js";
export {
  aiAssistantEnabled,
  SettingsPage,
  settingsTab,
} from "./settings/tabs.js";
export { genericSettingsTabs } from "./settings-tabs.js";
