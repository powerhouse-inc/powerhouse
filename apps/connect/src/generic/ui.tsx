// The generic plugin's UI: Connect's sidebar, drives, editors, settings and
// modals over core's routes. Loaded only while the plugin is active.
import type { ConnectPluginUi } from "@powerhousedao/connect-core/plugins";
import { AppLayout } from "./layout/app-layout.js";
import { DrivePending, RouteError } from "./layout/route-views.js";
import { genericModals } from "./modals.js";
import { DriveLayout, Home, NodeView } from "./pages/content.js";
import { SettingsPage } from "./settings/tabs.js";
import { settingsTabRoutes } from "./settings-tabs.js";

const GenericLayout = () => <AppLayout />;

const genericUi: ConnectPluginUi = {
  routes: {
    "/_app": { component: GenericLayout },
    "/_app/": { component: Home },
    "/_app/d/$driveSlug": {
      component: DriveLayout,
      pendingComponent: DrivePending,
    },
    "/_app/d/$driveSlug/{-$nodeSlug}": {
      component: NodeView,
      pendingComponent: DrivePending,
    },
    "/_app/settings": { component: SettingsPage },
    // Core's tabs; the package manager and the theme toggle replace them.
    "/_app/settings/appearance": { staticData: { settings: undefined } },
    "/_app/settings/packages": { staticData: { settings: undefined } },
  },
  addRoutes: settingsTabRoutes,
  modals: genericModals,
  errorComponent: RouteError,
  commonEditors: true,
};

export default genericUi;
