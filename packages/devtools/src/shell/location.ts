import type { PanelDef, Registry, TabDef } from "./registry.js";

/** `?ph-devtools=<panel>`: a link that opens DevTools on a panel. DevTools
 * reads it once and removes it from the URL. */
export const SHARE_PARAM = "ph-devtools";

export type DevtoolsFocus = { kind: string; id: string };

export type DevtoolsTarget = {
  panel: string;
  tab?: string;
  focus?: DevtoolsFocus;
};

export type DevtoolsLocation = {
  panel: string;
  tab: string;
  focus?: DevtoolsFocus;
};

/** What a tab shows: whether the dock is open, and where DevTools is. */
export type DevtoolsView = {
  open: boolean;
  target?: DevtoolsTarget;
};

export function defaultPanel(registry: Registry): PanelDef {
  return registry.panels[0];
}

export function panelById(registry: Registry, id: string): PanelDef {
  return registry.panels.find((p) => p.id === id) ?? defaultPanel(registry);
}

export function tabOf(panel: PanelDef, id: string | undefined): TabDef {
  const find = (tab: string | undefined) =>
    tab === undefined ? undefined : panel.tabs.find((t) => t.id === tab);
  return find(id) ?? find(panel.defaultTab?.()) ?? panel.tabs[0];
}

export function resolveTarget(
  target: DevtoolsTarget,
  registry: Registry,
): DevtoolsLocation {
  const known = registry.panels.some((p) => p.id === target.panel);
  const panel = panelById(registry, target.panel);
  const tab = tabOf(panel, known ? target.tab : undefined);
  const focus = known ? target.focus : undefined;
  return { panel: panel.id, tab: tab.id, ...(focus && { focus }) };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

function parseFocus(json: unknown): DevtoolsFocus | undefined {
  if (!isRecord(json) || !nonEmpty(json.kind) || !nonEmpty(json.id)) {
    return undefined;
  }
  return { kind: json.kind, id: json.id };
}

function parseTarget(json: unknown): DevtoolsTarget | undefined {
  if (!isRecord(json) || !nonEmpty(json.panel)) return undefined;
  const focus = parseFocus(json.focus);
  return {
    panel: json.panel,
    ...(nonEmpty(json.tab) && { tab: json.tab }),
    ...(focus && { focus }),
  };
}

/** A saved view, or undefined when it is not one. */
export function parseView(json: unknown): DevtoolsView | undefined {
  if (!isRecord(json) || typeof json.open !== "boolean") return undefined;
  const target = parseTarget(json.target);
  return { open: json.open, ...(target && { target }) };
}

/** The panel a share link names: undefined without the param, "" for a bare
 * one. The last wins when it repeats. */
export function sharedPanel(search: string): string | undefined {
  return new URLSearchParams(search).getAll(SHARE_PARAM).at(-1);
}
