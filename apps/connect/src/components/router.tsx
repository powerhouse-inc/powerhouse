import connectConfig from "#connect-config";
import React, { Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

const Content = React.lazy(() => import("../pages/content.js"));
const Root = React.lazy(() => import("./root.js"));

const AtlasImport = React.lazy(() =>
  import("./demo/atlas-import.js").then((m) => ({ default: m.AtlasImport })),
);

const routerBasename = connectConfig.routerBasename.endsWith("/")
  ? connectConfig.routerBasename.slice(0, -1)
  : connectConfig.routerBasename;

function createRouter(routes: RouteObject[]) {
  return createBrowserRouter(routes, {
    basename: routerBasename,
    future: {
      v7_fetcherPersist: true,
      v7_relativeSplatPath: true,
    },
  });
}

function createRoutes() {
  const routes: RouteObject[] = [
    {
      index: true,
      path: "d?/:driveId?/*?",
      element: (
        <Suspense name="Drive">
          <Content />
        </Suspense>
      ),
    },
    {
      path: "import/:documentId",
      element: (
        <Suspense name="AtlasImport">
          <AtlasImport />
        </Suspense>
      ),
    },
  ];

  return [
    {
      element: (
        <Suspense name="RouteRoot">
          <Root />
        </Suspense>
      ),
      children: routes,
    },
  ];
}

const routes = createRoutes();
const router = createRouter(routes);

export const Router = () => {
  return <RouterProvider router={router} />;
};
