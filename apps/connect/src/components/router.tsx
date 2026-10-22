import { connectConfig } from "@powerhousedao/connect/config";
import { routeTree } from "@powerhousedao/connect/route-tree";
import type { ConnectAppRouterOptions } from "@powerhousedao/connect-core/router";
import {
  disposeConnectAppRouter,
  getConnectAppRouter,
} from "@powerhousedao/connect-core/router";
import { getRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { ensurePHStore, usePHStore } from "@powerhousedao/reactor-browser";
import { RouterProvider } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { reportRouteError } from "../services/sentry.js";
import { ColdStartPending } from "./prerendered-shell.js";
import { RouterChrome } from "./route-views.js";

function connectRouterOptions(): ConnectAppRouterOptions {
  return {
    routeTree,
    basepath: connectConfig.routerBasename,
    InnerWrap: RouterChrome,
    pendingComponent: ColdStartPending,
    appName: getRuntimeConfig().connect.branding?.appName ?? undefined,
    onCatch: reportRouteError,
  };
}

// HMR re-runs this module: the replaced router must stop writing the selection.
import.meta.hot?.dispose(() => disposeConnectAppRouter());

/** The app's router, e.g. for tracing. */
export function getConnectRouter() {
  return getConnectAppRouter(ensurePHStore(), connectRouterOptions).router;
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
  const { router } = getConnectAppRouter(store, connectRouterOptions);
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
