// Building blocks for a project's own `_app` layout (hosts/connect/routes/_app.tsx).
export { SidebarItem } from "@powerhousedao/design-system/connect";
export { AppLayout } from "../components/app-layout.js";
export type { AppLayoutProps } from "../components/app-layout.js";
// For a project's override of the drive routes.
export { OpenDocument } from "../components/open-document.js";
export {
  Sidebar as ConnectSidebar,
  SidebarDriveItems,
  SidebarNavItems,
} from "../components/sidebar.js";
export type { SidebarProps as ConnectSidebarProps } from "../components/sidebar.js";
export {
  ContentOutlet,
  ModalDialog,
  RouteSelection,
  useDriveRouteData,
  useNavRoutes,
  useSidebarMode,
} from "@powerhousedao/connect-core/router";
export type { ModalFrameProps } from "@powerhousedao/connect-core/router";
