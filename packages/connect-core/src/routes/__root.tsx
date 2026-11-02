import { createRootRouteWithContext } from "@tanstack/react-router";
// By package name: a project's build shares the module Connect uses, and its
// declarations can name the types.
import type { ConnectRouterContext } from "@powerhousedao/connect-core/router";
import {
  appTitle,
  connectSearchMiddlewares,
  coreRouteOptions,
  coreView,
  notFoundTitle,
  validateConnectSearch,
} from "@powerhousedao/connect-core/router";

/** The root's options: search params and the app's title. */
export const options = coreRouteOptions({
  // Passes every param through; only the global ones outlive a navigation.
  // Inline type: project declaration emit can't name this module's types.
  validateSearch: (search: Record<string, unknown>) =>
    validateConnectSearch(search) as Record<string, string | undefined>,
  search: { middlewares: connectSearchMiddlewares },
  // Child routes' titles replace this one; a notFound() skips the heads below it.
  head: ({
    match,
    matches,
  }: {
    match: { context: ConnectRouterContext };
    matches: readonly { status: string }[];
  }) => ({
    meta: [
      {
        title: matches.some((m) => m.status === "notFound")
          ? notFoundTitle(match.context.appName)
          : appTitle(match.context.appName),
      },
    ],
  }),
});

// The page in the theme, with the matched routes' head.
export const Route = createRootRouteWithContext<ConnectRouterContext>()({
  ...options,
  component: coreView("CoreRoot"),
});
