import { createFileRoute } from "@tanstack/react-router";
import { coreRouteOptions, coreView } from "@powerhousedao/connect-core/router";

/** The layout's options; none yet. */
export const options = coreRouteOptions({});

// Pathless: the header and content area around home, drives, settings and a
// project's _app/ routes. A layout renders `ContentOutlet` for its content.
export const Route = createFileRoute("/_app")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("CoreLayout"),
});
