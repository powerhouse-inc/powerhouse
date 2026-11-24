import { DEVTOOLS_API_PATH, DEVTOOLS_PAGE_PATH } from "./paths.js";

/** What the app around DevTools can tell it or do for it. A host leaves out
 * what it does not have, and DevTools falls back as each member says. */
export type DevtoolsApp = {
  /** Ids of the editors and drive apps the app has loaded in this tab.
   * Without it, Build does not say whether a module is loaded. */
  loadedModules?: { editors: readonly string[]; apps: readonly string[] };
  /** Shows an error in the app's own notifications. Without it, the error
   * goes to the console. */
  notifyError?: (message: string) => void;
  /** Takes a search param out of the URL through the app's router, with no
   * history entry. Without it, DevTools replaces the URL itself. */
  removeSearchParam?: (name: string) => void;
  /** Moves the app to one of its own paths without loading the page again.
   * Without it, DevTools uses `history.pushState`, which a router that
   * patches it follows, as TanStack Router does. A router that changes the
   * URL later answers a promise that settles once it has. */
  navigate?: (href: string) => void | Promise<unknown>;
};

/** What the host hands DevTools. Every prop is optional: with none, DevTools
 * works on a dev server that serves the app at `/`. */
export type DevtoolsProps = {
  /** The base path the dev server serves the app under, for example "/app/".
   * The API answers below it, at `__ph/devtools/api`. "/" by default. */
  base?: string;
  /** Href of the standalone page. `__ph/devtools` below `base` by default. */
  standaloneHref?: string;
  /** Href that leaves the standalone page for the app. `base` by default. */
  appHref?: string;
  /** Pixels from the window's right edge that a control of the app takes at
   * the bottom-right corner. The launcher rests left of it. */
  bottomRightReserved?: number;
  /** The URL that opens a project file, given by its absolute path, in the
   * developer's editor. Vite's `__open-in-editor` below `base` by default. */
  openInEditorUrl?: (path: string) => string;
  app?: DevtoolsApp;
};

/** `DevtoolsProps` with every default worked out. */
export type DevtoolsHost = {
  apiBase: string;
  standaloneHref: string;
  appHref: string;
  bottomRightReserved: number;
  openInEditorUrl: (path: string) => string;
  app: DevtoolsApp;
};

const NO_APP: DevtoolsApp = {};

export function resolveHost(props: DevtoolsProps): DevtoolsHost {
  const segments = (props.base ?? "/").replace(/^\/+|\/+$/g, "");
  const prefix = segments ? `/${segments}` : "";
  return {
    apiBase: `${prefix}${DEVTOOLS_API_PATH}`,
    standaloneHref: props.standaloneHref ?? `${prefix}${DEVTOOLS_PAGE_PATH}`,
    appHref: props.appHref ?? `${prefix}/`,
    bottomRightReserved: props.bottomRightReserved ?? 0,
    openInEditorUrl:
      props.openInEditorUrl ??
      ((path) => `${prefix}/__open-in-editor?file=${encodeURIComponent(path)}`),
    app: props.app ?? NO_APP,
  };
}
