import type {
  PHDriveTarget,
  PHNavigation,
  PHNavigationTarget,
  PHSettingsTarget,
  SetSearchParams,
} from "@powerhousedao/reactor-browser";
import {
  applySearchUpdate,
  findDriveBySlugOrId,
  isSettingsTarget,
  makeDriveSlug,
  OPENED_FROM_STATE_KEY,
  openedFromIndex,
  resolveSearchUpdate,
} from "@powerhousedao/reactor-browser";
import type {
  AnyRouter,
  HistoryState,
  MakeRouteMatchUnion,
} from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import type { ConnectRouterBundle } from "./connect-router.js";
import { markNavigationClick } from "./perf-marks.js";
import { definedSearch } from "./search.js";
import { keepOpenedFrom, settingsTabs } from "./settings.js";

// Hover intent: a pointer passing over cards doesn't preload each of them.
const PRELOAD_DELAY_MS = 50;

/** The PH navigation backed by `router`; its hooks take the router directly,
 * so they work outside the RouterProvider. */
export function createConnectNavigation(
  connectRouter: ConnectRouterBundle,
): PHNavigation & { dispose(): void } {
  const { router, homeRoute, driveRoute, settingsRoute } = connectRouter;
  // Settings tabs can come from a project's routes, unknown to Connect's types.
  const anyRouter = router as unknown as AnyRouter;

  // A listed drive is addressed by its canonical slug, whatever form came in.
  const driveParams = (target: PHDriveTarget) => {
    const drive = findDriveBySlugOrId(
      router.options.context.store,
      target.driveSlug,
    );
    return {
      driveSlug: drive ? makeDriveSlug(drive) : target.driveSlug,
      nodeSlug: target.nodeSlug || undefined,
    };
  };

  // `true` is the first tab, so the URL names a tab without a redirect.
  const settingsPath = ({ settings }: PHSettingsTarget) => {
    const tab =
      settings === true ? settingsTabs(anyRouter).at(0)?.id : settings;
    return tab ? `${settingsRoute.fullPath}/${tab}` : settingsRoute.fullPath;
  };

  // In-document writes keep the entry's state, so its opened-from index too.
  const setSearch: PHNavigation["setSearch"] = (update, options) => {
    void router.navigate({
      to: ".",
      search: (prev) => applySearchUpdate({}, update(definedSearch(prev))),
      state: true,
      replace: options?.replace,
      resetScroll: false,
    });
  };

  const showsSettings = () =>
    router.state.matches.some((match) => match.routeId === settingsRoute.id);

  // A push remembers the entry it leaves; a replace keeps what that one had,
  // as does a move between settings tabs.
  const openedFromState = (
    replace: boolean | undefined,
    target: PHNavigationTarget | undefined,
  ) => {
    const { state } = router.history.location;
    const next =
      replace || (isSettingsTarget(target) && showsSettings())
        ? keepOpenedFrom(state)
        : ({
            [OPENED_FROM_STATE_KEY]: state.__TSR_index,
          } as unknown as HistoryState);
    return () => next;
  };

  const targetKey = (target: PHNavigationTarget | undefined) => {
    if (!target) return homeRoute.id;
    if (isSettingsTarget(target)) return settingsPath(target);
    const { driveSlug, nodeSlug } = driveParams(target);
    return JSON.stringify([driveSlug, nodeSlug ?? ""]);
  };
  let keyedMatches: readonly MakeRouteMatchUnion[] | undefined;
  let matchesKey: string | undefined;
  const currentKey = (matches: readonly MakeRouteMatchUnion[]) => {
    if (matches === keyedMatches) return matchesKey;
    keyedMatches = matches;
    const drive = matches.find((match) => match.routeId === driveRoute.id);
    const settings = matches.some(
      (match) => match.routeId === settingsRoute.id,
    );
    if (drive) {
      matchesKey = targetKey(drive.params as PHDriveTarget);
    } else if (settings) {
      // A tab's key is its path, as settingsPath builds it.
      matchesKey = matches.at(-1)?.fullPath.replace(/\/$/, "");
    } else {
      matchesKey = matches.find(
        (match) => match.routeId === homeRoute.id,
      )?.routeId;
    }
    return matchesKey;
  };

  // Hrefs depend only on the target and the global params of the current search.
  const hrefs = new Map<string, string>();
  let hrefsSearch: string | undefined;

  const setSearchParams: SetSearchParams = (update, options) =>
    setSearch((prev) => resolveSearchUpdate(prev, update), options);

  let preloadTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    location: () => router.history.location,
    // The root route's middlewares add the global params to `search`.
    open: (target, options) => {
      markNavigationClick();
      const search = applySearchUpdate({}, options?.search ?? {});
      const replace = options?.replace;
      const state = openedFromState(replace, target);
      if (!target) {
        void router.navigate({
          to: homeRoute.fullPath,
          search,
          replace,
          state,
        });
        return;
      }
      if (isSettingsTarget(target)) {
        void anyRouter.navigate({
          to: settingsPath(target),
          search,
          replace,
          state,
        });
        return;
      }
      void router.navigate({
        to: driveRoute.fullPath,
        params: driveParams(target),
        search,
        replace,
        state,
      });
    },
    // The public href, base path included; global params as `open` keeps them.
    hrefFor: (target) => {
      const { searchStr } = router.latestLocation;
      if (searchStr !== hrefsSearch) {
        hrefs.clear();
        hrefsSearch = searchStr;
      }
      const key = targetKey(target);
      let href = hrefs.get(key);
      if (href === undefined) {
        const location = !target
          ? router.buildLocation({ to: homeRoute.fullPath, search: {} })
          : isSettingsTarget(target)
            ? anyRouter.buildLocation({ to: settingsPath(target), search: {} })
            : router.buildLocation({
                to: driveRoute.fullPath,
                params: driveParams(target),
                search: {},
              });
        href = location.publicHref;
        hrefs.set(key, href);
      }
      return href;
    },
    // One key per shown matches, so each link's selector is a string compare.
    useIsCurrent: (target) => {
      // The settings page itself is current on any of its tabs.
      const anyTab = isSettingsTarget(target) && target.settings === true;
      const key = anyTab ? `${settingsRoute.fullPath}/` : targetKey(target);
      return useRouterState({
        router,
        select: (state) => {
          const current = currentKey(state.matches);
          return anyTab ? !!current?.startsWith(key) : current === key;
        },
      });
    },
    preload: (target) => {
      clearTimeout(preloadTimer);
      if (!target) return;
      preloadTimer = setTimeout(() => {
        const preloading = isSettingsTarget(target)
          ? anyRouter.preloadRoute({ to: settingsPath(target) })
          : router.preloadRoute({
              to: driveRoute.fullPath,
              params: driveParams(target),
            });
        preloading.catch(() => undefined);
      }, PRELOAD_DELAY_MS);
    },
    setSearch,
    // The presented matches' params, else the location's.
    useSearchParams() {
      const search = useRouterState({
        router,
        select: (state) =>
          state.matches.at(-1)?.search ?? state.location.search,
      });
      return useMemo(() => definedSearch(search), [search]);
    },
    useSetSearchParams: () => setSearchParams,
    closeOpened: () => {
      const { state } = router.history.location;
      const from = openedFromIndex(state, state.__TSR_index);
      if (from === undefined) return false;
      router.history.go(from - state.__TSR_index);
      return true;
    },
    dispose: () => clearTimeout(preloadTimer),
  };
}
