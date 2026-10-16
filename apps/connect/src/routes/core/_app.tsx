import { createFileRoute } from "@tanstack/react-router";
import { AppLayoutView } from "../../router/route-components.js";

// Pathless: the sidebar layout around home, drives, settings and a project's _app/ routes.
// A project's hosts/connect/routes/_app.tsx replaces this file.
export const Route = createFileRoute("/_app")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: AppLayoutView,
});
