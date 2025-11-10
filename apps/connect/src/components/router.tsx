import { Root } from "@powerhousedao/connect/components";
import { connectConfig } from "@powerhousedao/connect/config";
import { Content } from "@powerhousedao/connect/pages/content";
import { AtlasImport } from "@powerhousedao/connect/pages/demo/atlas-import";
import { Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

function createRouter(routes: RouteObject[]) {
  const routerBasename = connectConfig.routerBasename;

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
