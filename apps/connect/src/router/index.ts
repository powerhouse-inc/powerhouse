// Connect's router, without the app: safe to import where the app doesn't boot.
export {
  bindConnectRouter,
  CONTENT_VIEW_ID,
  createConnectRouter,
} from "./connect-router.js";
export type {
  ConnectRouter,
  ConnectRouterBundle,
  ConnectRouterFor,
  ConnectRouterOptions,
} from "./connect-router.js";
export { loadDriveRoute } from "./drive-route-loader.js";
export type {
  ConnectRouterContext,
  DriveRouteData,
  DriveRouteParams,
} from "./drive-route-loader.js";
export { createConnectNavigation } from "./navigation.js";
export {
  addConnectRoutes,
  connectRoutes,
  createConnectRouteTree,
  DRIVE_PENDING_MS,
  APP_ROUTE_ID,
  HOME_ROUTE_ID,
} from "./route-tree.js";
export type {
  ConnectRootRoute,
  ConnectRouteComponents,
  ConnectRoutes,
  ConnectRouteTree,
} from "./route-tree.js";
export {
  connectSearchMiddlewares,
  FEATURE_FLAG_PARAM_PREFIX,
  GLOBAL_SEARCH_PARAMS,
  parseConnectSearch,
  stringifyConnectSearch,
} from "./search.js";
export type { ConnectSearch } from "./search.js";
export type { CoreSettingsTabId } from "./route-components.js";
export { navRoutes, useNavRoutes, useSidebarMode } from "./sidebar.js";
export type { ConnectNavItem, NavRouteEntry, SidebarMode } from "./sidebar.js";
export {
  SETTINGS_ROUTE_ID,
  settingsTabs,
  settingsTitle,
  useSettingsTabs,
} from "./settings.js";
export type { ConnectSettingsTab, SettingsTabEntry } from "./settings.js";
