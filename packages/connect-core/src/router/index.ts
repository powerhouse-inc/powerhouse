// Connect's router, without the app: safe to import where the app doesn't boot.
export { bindConnectRouter, createConnectRouter } from "./connect-router.js";
export type {
  ConnectRouter,
  ConnectRouterBundle,
  ConnectRouterFor,
  ConnectRouterOptions,
} from "./connect-router.js";
export { isDriveNotFound, loadDrive, loadNode } from "./drive-route-loader.js";
export type {
  ConnectRouterContext,
  DriveLoaderOptions,
  DriveNotFoundData,
  DriveRouteData,
  DriveRouteParams,
} from "./drive-route-loader.js";
export {
  DRIVE_ROUTE_ID,
  NODE_ROUTE_ID,
  useDriveRouteData,
  useDriveRouteIds,
} from "./route-data.js";
export type { DriveRouteView } from "./route-data.js";
export { RouteSelection } from "./route-selection.js";
export { useIsColdStart } from "./cold-start.js";
export { disposeConnectAppRouter, getConnectAppRouter } from "./app-router.js";
export type { ConnectAppRouterOptions } from "./app-router.js";
export { createConnectNavigation } from "./navigation.js";
export {
  markNavigationClick,
  markRouterNavigations,
  PERF_STORAGE_KEY,
  ROUTER_MEASURES,
  routerPerfEnabled,
} from "./perf-marks.js";
export {
  addConnectRoutes,
  connectRoutes,
  DRIVE_PENDING_MS,
  APP_ROUTE_ID,
  HOME_ROUTE_ID,
  registerConnectRoutes,
  registerPackageRoutes,
  holdConnectRoutes,
  connectRoutesSettled,
  removeConnectRoutes,
} from "./route-tree.js";
export type {
  ConnectRootRoute,
  ConnectRouteRegistration,
  ConnectRoutes,
  PackageRoute,
} from "./route-tree.js";
export {
  CONTENT_VIEW_ID,
  ContentOutlet,
  CoreNotFound,
  CoreError,
  coreView,
  DrivePending,
} from "./route-components.js";
export type { DocumentViewProps, DriveViewProps } from "./route-components.js";
export { coreModals, ModalOutlet } from "./modals.js";
export { ModalDialog, useModalFrame } from "./modal-frame.js";
export type { ModalFrameProps } from "./modal-frame.js";
export type { ConnectModals } from "./modals.js";
export { bindConnectScroll, connectScrollRestoration } from "./scroll.js";
export {
  connectSearchMiddlewares,
  definedSearch,
  FEATURE_FLAG_PARAM_PREFIX,
  GLOBAL_SEARCH_PARAMS,
  parseConnectSearch,
  stringifyConnectSearch,
  validateConnectSearch,
  validateDriveSearch,
} from "./search.js";
export type { ConnectSearch } from "./search.js";
export { navRoutes, useNavRoutes, useSidebarMode } from "./sidebar.js";
export type { ConnectNavItem, NavRouteEntry, SidebarMode } from "./sidebar.js";
export {
  keepOpenedFrom,
  redirectToSettingsTab,
  setSettingsRoute,
  SETTINGS_ROUTE_ID,
  settingsTabs,
  settingsTabsOf,
  settingsTitle,
  showsSettingsTab,
  useForgetSettingsOpenedFrom,
  useSettingsTabs,
} from "./settings.js";
export type { ConnectSettingsTab, SettingsTabEntry } from "./settings.js";
export { appTitle, driveTitle, notFoundTitle } from "./titles.js";
