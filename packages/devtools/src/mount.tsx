import {
  Component,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import css from "virtual:ph-devtools-css";
import { powerhouseAppSource, type AppSource } from "./app-source.js";
import { readDevtoolsBase, readDevtoolsToken } from "./host.js";
import { resolveHost, type DevtoolsProps } from "./props.js";
import { REGISTRY } from "./registry.js";
import { DevtoolsShell, useIsStandalonePath } from "./shell/root.js";
import { keepFieldKeysInside } from "./shell/shortcuts.js";

export { powerhouseAppSource, type AppSource } from "./app-source.js";
export type { DevtoolsApp, DevtoolsProps } from "./props.js";

type MountedProps = DevtoolsProps & {
  /** "auto", the default, follows a `dark` class on `<html>`. */
  theme?: "auto" | "light" | "dark";
  /** "auto", the default, shows the standalone page while the location is
   * its path, and the dock everywhere else. "page" shows the page wherever
   * the location is: an app whose router keeps the location to itself says
   * so while its router is on the page. */
  surface?: "auto" | "page";
  /** Where DevTools reads what the app knows. By default what a Powerhouse
   * app keeps on `window.ph`. A member of `app` goes ahead of the source's. */
  appSource?: AppSource;
};

export type MountDevtoolsOptions = MountedProps & {
  /** Where the DevTools element goes. `document.body` by default. */
  target?: HTMLElement;
};

export type DevtoolsHandle = {
  /** Shows DevTools with `options` laid over the ones it has. */
  update: (options: MountedProps) => void;
  unmount: () => void;
};

const HOST_ATTRIBUTE = "data-ph-devtools";

function subscribeToHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const htmlIsDark = () => document.documentElement.classList.contains("dark");

/** Keeps a failure of DevTools to DevTools: it goes away, and the app it is
 * mounted on goes on. */
class Contained extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(
      "[devtools] DevTools stopped after an error. Reload the page to get it back.",
      error,
    );
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Mounted({
  theme = "auto",
  surface = "auto",
  appSource,
  app: given,
  ...rest
}: MountedProps & { appSource: AppSource }) {
  const sourced = useSyncExternalStore(appSource.subscribe, appSource.read);
  const app = useMemo(() => ({ ...sourced, ...given }), [sourced, given]);
  const props = { ...rest, app };
  const pageIsDark = useSyncExternalStore(subscribeToHtmlClass, htmlIsDark);
  const dark = theme === "auto" ? pageIsDark : theme === "dark";
  const onPagePath = useIsStandalonePath(resolveHost(props).standaloneHref);
  return (
    <div className={dark ? "dark" : undefined}>
      <DevtoolsShell
        {...props}
        registry={REGISTRY}
        surface={surface === "page" || onPagePath ? "page" : "dock"}
      />
    </div>
  );
}

type Live = { handle: DevtoolsHandle; moveTo: (target: HTMLElement) => void };

/** The page's one DevTools, kept on the page: the module can load twice, once
 * as the dev server serves it and once as the app's own bundler does. */
const LIVE = Symbol.for("@powerhousedao/devtools/mounted");
const page = globalThis as typeof globalThis & { [LIVE]?: Live };

/**
 * Shows DevTools on a page of any app, whatever it is built with: the dock,
 * and the standalone page when the location is its path. DevTools renders in
 * a shadow root with its own stylesheet and its own React, so the page's
 * styles and DevTools' do not reach each other.
 *
 * Returns the handle of what is mounted, or undefined on a page no DevTools
 * dev server served, where it does nothing. A page has one DevTools: the dev
 * server's module mounts it before the app's code runs, and a later call
 * lays its `options` over that mount. The base path comes from the dev
 * server's tag unless `options` has one.
 */
export function mountDevtools({ target, ...given }: MountDevtoolsOptions = {}):
  | DevtoolsHandle
  | undefined {
  if (!readDevtoolsToken()) return undefined;
  const live = page[LIVE];
  if (live) {
    if (target) live.moveTo(target);
    if (Object.keys(given).length > 0) live.handle.update(given);
    return live.handle;
  }

  let props: MountedProps = { base: readDevtoolsBase(), ...given };
  const windowSource = powerhouseAppSource();
  const element = document.createElement("div");
  element.setAttribute(HOST_ATTRIBUTE, "");
  // Inherited properties cross a shadow root, and the page's rules for this
  // element go ahead of the shadow root's own: none of them reach DevTools.
  element.style.setProperty("all", "initial");
  const shadow = element.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  shadow.adoptedStyleSheets = [sheet];
  keepFieldKeysInside(shadow);

  const container = document.createElement("div");
  shadow.append(container);
  (target ?? document.body).append(element);
  const root = createRoot(container);
  const render = () =>
    root.render(
      <Contained>
        <Mounted {...props} appSource={props.appSource ?? windowSource} />
      </Contained>,
    );
  render();

  let mounted = true;
  const handle: DevtoolsHandle = {
    update(next) {
      if (!mounted) return;
      props = { ...props, ...next };
      render();
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
      element.remove();
      delete page[LIVE];
    },
  };
  page[LIVE] = { handle, moveTo: (next) => next.append(element) };
  return handle;
}
