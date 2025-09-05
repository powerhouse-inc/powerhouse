import { connectConfig } from "@powerhousedao/connect/config";
import { Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import Content from "../pages/content.js";
import { AtlasImport } from "./demo/atlas-import.js";
import Root from "./root.js";

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
