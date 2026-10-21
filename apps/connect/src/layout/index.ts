// Core's building blocks for a project's own `_app` layout (hosts/connect/routes/_app.tsx).
// Connect's sidebar and AppLayout are the generic plugin's: `@powerhousedao/connect/generic`.
export { SidebarItem } from "@powerhousedao/design-system/connect";
export {
  ContentOutlet,
  ModalDialog,
  useDriveRouteData,
  useNavRoutes,
  useSidebarMode,
} from "@powerhousedao/connect-core/router";
export type { ModalFrameProps } from "@powerhousedao/connect-core/router";
