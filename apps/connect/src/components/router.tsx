import { Root } from "./root.js";
import { connectConfig } from "@powerhousedao/connect/config";
import { Content } from "../pages/content.js";
import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  createDriveArrivals,
  ensurePHStore,
  usePHStore,
} from "@powerhousedao/reactor-browser";
import { RouterProvider } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getRuntimeConfig } from "../runtime-config.js";
import type { ConnectRouteComponents } from "../router/route-components.js";
import type * as SettingsModule from "./settings/index.js";
import { AppLayout } from "./app-layout.js";
import { LoadingShell } from "./prerendered-shell.js";
import {
  bindConnectRouter,
  createConnectRouter,
} from "../router/connect-router.js";
import { DriveNotFoundPage, NotFoundPage } from "./not-found-page.js";
import { DrivePending, RouteError, RouterChrome } from "./route-views.js";

const EmptyView = () => null;

const settingsModule = () => import("./settings/index.js");
const lazySettings = (name: keyof typeof SettingsModule) =>
  lazy(() => settingsModule().then((m) => ({ default: m[name] })));
const SettingsPage = lazySettings("SettingsPage");

export const connectRouteComponents: ConnectRouteComponents = {
  root: () => (
    <Suspense name="RouteRoot" fallback={<LoadingShell Fallback={EmptyView} />}>
      <Root />
    </Suspense>
  ),
  app: () => <AppLayout />,
  content: () => (
    <Suspense name="Drive">
      <Content />
    </Suspense>
  ),
  notFound: NotFoundPage,
  drivePending: DrivePending,
  driveNotFound: DriveNotFoundPage,
  error: RouteError,
  settings: () => (
    <Suspense name="Settings">
      <SettingsPage />
    </Suspense>
  ),
  settingsTabs: {
    ...(connectConfig.aiAssistantEnabled && {
      "ai-assistant": lazySettings("AiAssistant"),
    }),
    "package-manager": lazySettings("ConnectPackageManager"),
    "default-editors": lazySettings("DefaultEditor"),
    "danger-zone": lazySettings("DangerZone"),
    about: lazySettings("About"),
  },
};

let connectRouter: ReturnType<typeof createConnectRouter> | undefined;
let routerStore: PHStore | undefined;
let unbindConnectRouter: (() => void) | undefined;

// HMR re-runs this module: the replaced router must stop writing the selection.
import.meta.hot?.dispose(() => unbindConnectRouter?.());

// One router per app; its context is the app's PH store. It becomes the PH
// navigator as it is created, so selection setters navigate from the start.
function getConnectRouterFor(store: PHStore) {
  if (connectRouter) {
    if (import.meta.env.DEV && store !== routerStore) {
      throw new Error("Connect's router is already bound to another PH store");
    }
    return connectRouter;
  }
  routerStore = store;
  connectRouter = createConnectRouter({
    store,
    arrivals: createDriveArrivals(store),
    components: connectRouteComponents,
    basepath: connectConfig.routerBasename,
    InnerWrap: RouterChrome,
    appName: getRuntimeConfig().connect.branding?.appName ?? undefined,
  });
  unbindConnectRouter = bindConnectRouter(connectRouter, store);
  return connectRouter;
}

/** The app's router, e.g. for tracing. */
export function getConnectRouter() {
  return getConnectRouterFor(ensurePHStore()).router;
}

// Dev only: production builds drop the import with this branch.
const RouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : undefined;

export const Router = () => {
  const store = usePHStore() ?? ensurePHStore();
  const { router } = getConnectRouterFor(store);
  return (
    <>
      <RouterProvider router={router} />
      {RouterDevtools && (
        <Suspense name="RouterDevtools">
          <RouterDevtools router={router} position="bottom-left" />
        </Suspense>
      )}
    </>
  );
};
