import { createFileRoute } from "@tanstack/react-router";
import type { ConnectRouterContext } from "@powerhousedao/connect-core/router";
import {
  connectRoutesSettled,
  coreRouteOptions,
  coreView,
  notFoundTitle,
} from "@powerhousedao/connect-core/router";

/** Not found's options: its title, and a wait for routes still loading. */
export const options = coreRouteOptions({
  head: ({ match }: { match: { context: ConnectRouterContext } }) => ({
    meta: [{ title: notFoundTitle(match.context.appName) }],
  }),
  // A package's routes may still be loading: the path may be one of them.
  loader: () => connectRoutesSettled(),
});

// Unknown paths, inside the layout so it stays; matched last.
export const Route = createFileRoute("/_app/$")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("NotFoundPage"),
});
