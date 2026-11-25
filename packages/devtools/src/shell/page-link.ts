import type { MouseEvent } from "react";
import type { DevtoolsApp } from "../props.js";
import { useShell } from "./state.js";

const MOVED = "ph-devtools:page-moved";

/** Whether DevTools itself moved this page from the app to its standalone
 * page, so the entry before this one is where the app was. */
let cameFromApp = false;

/** Tells when DevTools moved the page: `pushState` changes the URL without a
 * `popstate`. */
export function subscribeToPageMoves(onChange: () => void): () => void {
  const onBack = () => {
    cameFromApp = false;
    onChange();
  };
  window.addEventListener(MOVED, onChange);
  window.addEventListener("popstate", onBack);
  return () => {
    window.removeEventListener(MOVED, onChange);
    window.removeEventListener("popstate", onBack);
  };
}

/** Moves the page to `href` without loading it again, as a link of the app's
 * own router does. A router that patches `pushState`, as TanStack Router
 * does, follows; an app with another kind of router gives `navigate`. */
function movePage(href: string, navigate?: DevtoolsApp["navigate"]) {
  const told = () => window.dispatchEvent(new Event(MOVED));
  if (!navigate) {
    window.history.pushState(null, "", href);
    return told();
  }
  // A router may change the URL only once its navigation settles.
  void Promise.resolve(navigate(href)).then(told, told);
  told();
}

/** A plain click: one that would load `href` in this tab. A click with a
 * modifier or another button keeps its meaning, such as a new tab. */
const loadsHere = (event: MouseEvent) =>
  event.button === 0 &&
  !event.defaultPrevented &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

type PageLink = { href: string; onClick: (event: MouseEvent) => void };

/**
 * The two moves between the app and the standalone page, as links that do
 * not load the page again: the app keeps running under both.
 */
export function usePageLinks(): {
  standalone: PageLink;
  app: PageLink;
  openStandalone: () => void;
} {
  const { host } = useShell();
  const { navigate } = host.app;

  const openStandalone = () => {
    movePage(host.standaloneHref, navigate);
    cameFromApp = true;
  };
  // Back where the app was, when this page came from it; else the app's home.
  const openApp = () => {
    if (cameFromApp) window.history.back();
    else movePage(host.appHref, navigate);
  };
  const link = (href: string, open: () => void): PageLink => ({
    href,
    onClick: (event) => {
      if (!loadsHere(event)) return;
      event.preventDefault();
      open();
    },
  });
  return {
    standalone: link(host.standaloneHref, openStandalone),
    app: link(host.appHref, openApp),
    openStandalone,
  };
}
