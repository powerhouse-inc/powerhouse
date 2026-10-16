import { Root } from "@powerhousedao/connect/components";
import { connectConfig } from "@powerhousedao/connect/config";
import { Content } from "@powerhousedao/connect/pages";
import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  createDriveArrivals,
  ensurePHStore,
  usePHStore,
} from "@powerhousedao/reactor-browser";
import { RouterProvider } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import type { ConnectRouteComponents } from "../router/route-components.js";
import { AppLayout } from "./app-layout.js";
import {
  bindConnectRouter,
  createConnectRouter,
} from "../router/connect-router.js";
import { DrivePending, RouteError, RouterChrome } from "./route-views.js";

export const connectRouteComponents: ConnectRouteComponents = {
  root: () => (
    <Suspense name="RouteRoot">
      <Root />
    </Suspense>
  ),
  app: () => <AppLayout />,
  content: () => (
    <Suspense name="Drive">
      <Content />
    </Suspense>
  ),
  drivePending: DrivePending,
  error: RouteError,
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
