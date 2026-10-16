// Building blocks for a project's own `_app` layout (hosts/connect/routes/_app.tsx).
export { SidebarItem } from "@powerhousedao/design-system/connect";
export { AppLayout } from "../components/app-layout.js";
export type { AppLayoutProps } from "../components/app-layout.js";
export {
  Sidebar as ConnectSidebar,
  SidebarDriveItems,
  SidebarNavItems,
} from "../components/sidebar.js";
export type { SidebarProps as ConnectSidebarProps } from "../components/sidebar.js";
export { useNavRoutes, useSidebarMode } from "../router/sidebar.js";
