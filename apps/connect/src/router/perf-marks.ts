import type { AnyRouter } from "@tanstack/react-router";

/** `localStorage[PERF_STORAGE_KEY] = "1"` or `?perf=1` turns the marks on in production. */
export const PERF_STORAGE_KEY = "ph:perf";

/** The measures each navigation writes, as the bench reads them. */
export const ROUTER_MEASURES = {
  /** `navigation.open` to the router starting the navigation. */
  click: "nav click",
  /** Route loaders, until the router commits the matches. */
  loader: "nav loader",
  /** The commit until React has rendered it. */
  commit: "nav commit",
  /** The click (or the navigation's start) to the next frame after render. */
  total: "nav total",
} as const;

// Chrome's Performance panel shows these as "Connect › Router".
const DETAIL = {
  devtools: { dataType: "track-entry", track: "Router", trackGroup: "Connect" },
} as const;

let marking = 0;
let clickedAt: number | undefined;

/** On in dev builds; elsewhere only with the runtime flag. */
export function routerPerfEnabled(dev: boolean = import.meta.env.DEV) {
  if (dev) return true;
  try {
    return (
      new URLSearchParams(location.search).get("perf") === "1" ||
      localStorage.getItem(PERF_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/** Marks a navigation's click; a no-op unless a router is being marked. */
export function markNavigationClick() {
  if (!marking) return;
  clickedAt = performance.now();
  performance.mark("nav:click", { detail: DETAIL });
}

function measure(name: string, start: number | undefined, end: number) {
  if (start === undefined) return;
  performance.measure(name, { start, end, detail: DETAIL });
}

/** Writes each navigation's phases as performance measures; returns the unsubscribe. */
export function markRouterNavigations(
  router: Pick<AnyRouter, "subscribe">,
  enabled = routerPerfEnabled(),
) {
  if (!enabled) return () => {};
  marking++;
  let generation = 0;
  let clicked: number | undefined;
  let navigated: number | undefined;
  let loading: number | undefined;
  let loaded: number | undefined;
  const unsubscribes = [
    router.subscribe("onBeforeNavigate", () => {
      generation++;
      navigated = performance.now();
      clicked = clickedAt;
      clickedAt = undefined;
      measure(ROUTER_MEASURES.click, clicked, navigated);
      loading = loaded = undefined;
    }),
    router.subscribe("onBeforeLoad", () => {
      loading = performance.now();
    }),
    router.subscribe("onLoad", () => {
      loaded = performance.now();
      measure(ROUTER_MEASURES.loader, loading, loaded);
    }),
    router.subscribe("onRendered", () => {
      measure(ROUTER_MEASURES.commit, loaded, performance.now());
      const current = generation;
      const start = clicked ?? navigated;
      // The frame after render, as close to paint as a script sees.
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (current === generation) {
            measure(ROUTER_MEASURES.total, start, performance.now());
          }
        }),
      );
    }),
  ];
  return () => {
    marking--;
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
