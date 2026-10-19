import { createFileRoute } from "@tanstack/react-router";
import { NotFoundView } from "../../../router/route-components.js";
import { notFoundTitle } from "../../../router/titles.js";

// Unknown paths, inside the layout so the sidebar stays; matched last.
export const Route = createFileRoute("/_app/$")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  head: ({ match }) => ({
    meta: [{ title: notFoundTitle(match.context.appName) }],
  }),
  component: NotFoundView,
});
