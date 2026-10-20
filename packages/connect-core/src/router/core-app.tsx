import type { PHStore } from "@powerhousedao/reactor-browser";
import { PHStoreProvider } from "@powerhousedao/reactor-browser";
import type { AnyRoute } from "@tanstack/react-router";
import { RouterProvider } from "@tanstack/react-router";
import type { ConnectAppRouterOptions } from "./app-router.js";
import { getConnectAppRouter } from "./app-router.js";

/** A core-only app: `routeTree`'s views over `store`. */
export function ConnectCoreApp(props: {
  store: PHStore;
  routeTree: AnyRoute;
  basepath?: string;
  options?: () => Omit<ConnectAppRouterOptions, "routeTree">;
}) {
  const { router } = getConnectAppRouter(props.store, () => ({
    basepath: props.basepath,
    ...props.options?.(),
    routeTree: props.routeTree,
  }));
  return (
    <PHStoreProvider store={props.store}>
      <RouterProvider router={router} />
    </PHStoreProvider>
  );
}
