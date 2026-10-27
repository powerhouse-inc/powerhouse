// Core's building blocks for a project's own `_app` layout (hosts/connect/routes/_app.tsx).
// Connect's sidebar and AppLayout are the generic plugin's: `@powerhousedao/connect/generic`.
export { SidebarItem } from "@powerhousedao/design-system/connect";
export {
  ContentOutlet,
  ModalDialog,
  useConnectChrome,
  useDriveRouteData,
  useNavRoutes,
  useSidebarMode,
} from "@powerhousedao/connect-core/router";
export type {
  ConnectChrome,
  ModalFrameProps,
} from "@powerhousedao/connect-core/router";
