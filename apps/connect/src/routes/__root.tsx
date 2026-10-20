import { options } from "@powerhousedao/connect-core/routes/__root";
import type { ConnectRouterContext } from "@powerhousedao/connect-core/router";
import { ConnectRoot } from "@powerhousedao/connect/route-views";
import { createRootRouteWithContext } from "@tanstack/react-router";

export { options };

// Core's search and title; Connect's page, with or without the generic plugin.
export const Route = createRootRouteWithContext<ConnectRouterContext>()({
  ...options,
  component: ConnectRoot,
});
