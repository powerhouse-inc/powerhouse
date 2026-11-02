import { createFileRoute } from "@tanstack/react-router";
import { coreRouteOptions, coreView } from "@powerhousedao/connect-core/router";

/** Home's options; none yet. */
export const options = coreRouteOptions({});

// The drives, as an index.
export const Route = createFileRoute("/_app/")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("DriveIndex"),
});
