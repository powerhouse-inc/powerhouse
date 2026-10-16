import { createRootRouteWithContext } from "@tanstack/react-router";
// Types by package name, so a project's declarations can name them.
import type { ConnectRouterContext } from "@powerhousedao/connect/router";
import { RootView } from "../router/route-components.js";
import {
  connectSearchMiddlewares,
  validateConnectSearch,
} from "../router/search.js";
import { appTitle, notFoundTitle } from "../router/titles.js";

export const Route = createRootRouteWithContext<ConnectRouterContext>()({
  // Passes every param through; only the global ones outlive a navigation.
  // Inline type: project declaration emit can't name this module's types.
  validateSearch: (search: Record<string, unknown>) =>
    validateConnectSearch(search) as Record<string, string | undefined>,
  search: { middlewares: connectSearchMiddlewares },
  // Child routes' titles replace this one; a notFound() skips the heads below it.
  head: ({ match, matches }) => ({
    meta: [
      {
        title: matches.some((m) => m.status === "notFound")
          ? notFoundTitle(match.context.appName)
          : appTitle(match.context.appName),
      },
    ],
  }),
  component: RootView,
});
