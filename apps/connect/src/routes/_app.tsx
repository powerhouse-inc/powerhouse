import { options } from "@powerhousedao/connect-core/routes/_app";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's header around the content; the generic plugin's sidebar replaces it.
export const Route = createFileRoute("/_app")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("CoreLayout"),
});
