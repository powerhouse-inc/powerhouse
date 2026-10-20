import { options } from "@powerhousedao/connect-core/routes/_app/$";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's not-found page, inside the layout.
export const Route = createFileRoute("/_app/$")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("NotFoundPage"),
});
