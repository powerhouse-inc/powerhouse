import { LayoutDashboard } from "lucide-react";
import { BUILD_GROUP, BUILD_PANELS } from "./build/pages/index.js";
import { ProjectProvider, useProject } from "./build/project/provider.js";
import { OverviewPage } from "./overview/page.js";
import type { Registry } from "./shell/registry.js";

function useProjectUnavailable(): string | undefined {
  const project = useProject();
  return project.state === "unavailable" ? project.message : undefined;
}

/** The panels DevTools has, over the project the dev server reads. */
export const REGISTRY: Registry = {
  groups: [{ id: "project", label: "Project" }, BUILD_GROUP],
  panels: [
    {
      id: "overview",
      title: "Overview",
      icon: LayoutDashboard,
      group: "project",
      tabs: [{ id: "overview", title: "Overview", component: OverviewPage }],
    },
    ...BUILD_PANELS,
  ],
  Provider: ProjectProvider,
  useUnavailable: useProjectUnavailable,
};
