import { createFileRoute } from "@tanstack/react-router";
import { ContentView } from "../../router/route-components.js";

// Pathless, so the route id keeps the content mounted across child routes.
export const Route = createFileRoute("/_content")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: ContentView,
});
