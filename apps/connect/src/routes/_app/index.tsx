import { options } from "@powerhousedao/connect-core/routes/_app/index";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's drive index; the generic plugin's drive cards replace it.
export const Route = createFileRoute("/_app/")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("DriveIndex"),
});
