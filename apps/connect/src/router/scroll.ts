import type {
  AnyRouter,
  ParsedLocation,
  RouterHistory,
} from "@tanstack/react-router";

type ScrollRouter = Pick<AnyRouter, "subscribe" | "_scroll" | "options"> & {
  history: RouterHistory;
};

const TRAVERSALS = new Set(["BACK", "FORWARD", "GO"]);
const traversals = new WeakMap<object, { traversal: boolean }>();

/** The router's `scrollRestoration`: on for back/forward only; other
 * navigations reset the content view in `bindConnectScroll`. */
export function connectScrollRestoration() {
  // The first load restores a reloaded page's scroll.
  const state = { traversal: true };
  const restore = ({ location }: { location: ParsedLocation }) =>
    state.traversal || !!location.hash;
  traversals.set(restore, state);
  return restore;
}

/** Tracks history actions, and resets a scrolled content view on new views. */
export function bindConnectScroll(router: ScrollRouter, contentViewId: string) {
  const state = traversals.get(router.options.scrollRestoration as object);
  if (!state) return () => {};
  const unsubscribeHistory = router.history.subscribe(({ action }) => {
    state.traversal = TRAVERSALS.has(action.type);
  });
  if (typeof document === "undefined") return unsubscribeHistory;

  // Read in the scroll event, where layout is clean, not at navigation.
  let scrolledView: Element | undefined;
  let windowScrolled = false;
  const onScroll = (event: Event) => {
    const target = event.target;
    if (target === document) {
      windowScrolled = window.scrollY > 0 || window.scrollX > 0;
    } else if (target instanceof Element && target.id === contentViewId) {
      scrolledView = target.scrollTop > 0 ? target : undefined;
    }
  };
  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });

  let resetScroll = true;
  const unsubscribes = [
    unsubscribeHistory,
    // The navigation's `resetScroll`, before the router clears it on render.
    router.subscribe("onBeforeRouteMount", () => {
      resetScroll = router._scroll.n;
    }),
    router.subscribe("onRendered", ({ toLocation }) => {
      if (state.traversal || toLocation.hash || !resetScroll) return;
      if (scrolledView?.isConnected) scrolledView.scrollTo(0, 0);
      if (windowScrolled) window.scrollTo(0, 0);
      scrolledView = undefined;
      windowScrolled = false;
    }),
  ];
  return () => {
    document.removeEventListener("scroll", onScroll, { capture: true });
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
