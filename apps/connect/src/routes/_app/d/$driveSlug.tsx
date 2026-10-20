import { options } from "@powerhousedao/connect-core/routes/_app/d/$driveSlug";
import { coreView } from "@powerhousedao/connect-core/router";
import { createFileRoute } from "@tanstack/react-router";

export { options };

// Core's directory listing; the generic plugin's drive app replaces it.
export const Route = createFileRoute("/_app/d/$driveSlug")({
  ...options,
  // Connect's routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("DriveLayout"),
});
