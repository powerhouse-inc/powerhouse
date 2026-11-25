import { AppWindow, Cpu, FileCode2, SquarePen, Waypoints } from "lucide-react";
import type { ProjectModuleKind } from "../api.js";
import type { NavGroup, PanelDef, PanelProps } from "../shell/registry.js";
import { MODULE_KINDS } from "../project/kinds.js";
import { useModuleKindBadge } from "../project/provider.js";
import { ModelsPage } from "./models/models-page.js";
import { ModuleKindPage } from "./module-kind/module-kind-page.js";
import type { ModulePageKind } from "./module-kind/page-module.js";

export const BUILD_GROUP: NavGroup = { id: "build", label: "Build" };

const kindPage = (kind: ModulePageKind) =>
  function KindPage(props: PanelProps) {
    return <ModuleKindPage {...props} kind={kind} />;
  };

const kindPanel = (
  kind: ProjectModuleKind,
  icon: PanelDef["icon"],
  component: PanelDef["tabs"][number]["component"],
): PanelDef => {
  const { panel, title } = MODULE_KINDS[kind];
  return {
    id: panel,
    title,
    icon,
    group: BUILD_GROUP.id,
    tabs: [{ id: panel, title, component, fill: kind !== "document-model" }],
    useBadge: () => useModuleKindBadge(kind),
  };
};

export const BUILD_PANELS: PanelDef[] = [
  kindPanel("document-model", FileCode2, ModelsPage),
  kindPanel("editor", SquarePen, kindPage("editor")),
  kindPanel("app", AppWindow, kindPage("app")),
  kindPanel("subgraph", Waypoints, kindPage("subgraph")),
  kindPanel("processor", Cpu, kindPage("processor")),
];
