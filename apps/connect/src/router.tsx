import { connectConfig } from "@powerhousedao/connect/config";
import { RouterProvider, createBrowserRouter } from "react-router";
import AppSkeleton from "./components/app-skeleton.js";

function createRouter() {
  const routerBasename = connectConfig.routerBasename;

  return createBrowserRouter(
    [
      {
        path: "/",
        lazy: {
          loader: async () => (await import("./pages/root.loader.js")).loader,
          Component: async () => (await import("./pages/root.js")).Root,
        },
        HydrateFallback: AppSkeleton,
        children: [
          {
            index: true,
            lazy: {
              Component: async () => (await import("./pages/home.js")).HomePage,
            },
          },
          {
            path: "d/:driveId?/*?",
            lazy: {
              Component: async () =>
                (await import("./pages/drive.js")).DrivePage,
              HydrateFallback: async () =>
                (await import("./components/app-skeleton.js")).AppSkeleton,
            },
          },
          {
            path: "import/:documentId",
            lazy: {
              Component: async () =>
                (await import("./pages/demo/atlas-import.js")).AtlasImportPage,
            },
          },
        ],
      },
    ],
    {
      basename: routerBasename,
    },
  );
}

const router = createRouter();

export const Router = () => {
  return <RouterProvider router={router} />;
};
