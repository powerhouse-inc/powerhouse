import type { DevtoolsFocus, DevtoolsView } from "../src/shell/location.js";

const VIEW_KEY = "ph-devtools:view";

export function clearStorage() {
  localStorage.clear();
  sessionStorage.clear();
}

/** Saves what this tab shows, as a reload of the tab finds it. */
export function seedView(view: DevtoolsView) {
  sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
}

/** What this tab saved, with the focus as `kind:id`. */
export function savedView() {
  const raw = sessionStorage.getItem(VIEW_KEY);
  const view = raw === null ? undefined : (JSON.parse(raw) as DevtoolsView);
  const focus = view?.target?.focus;
  return {
    open: view?.open,
    panel: view?.target?.panel,
    tab: view?.target?.tab,
    focus: focus && `${focus.kind}:${focus.id}`,
  };
}

/** `kind:id` as a focus. */
export function focusOf(raw: string): DevtoolsFocus {
  const separator = raw.indexOf(":");
  return { kind: raw.slice(0, separator), id: raw.slice(separator + 1) };
}
