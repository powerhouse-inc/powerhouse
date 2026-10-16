// The settings page: its tabs are the /settings route's children with `staticData.settings`.
import {
  OPENED_FROM_STATE_KEY,
  SETTINGS_PATH,
} from "@powerhousedao/reactor-browser";
import type {
  AnyRoute,
  AnyRouter,
  HistoryState,
  MakeRouteMatchUnion,
} from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useMemo } from "react";
import type { ConnectRouterContext } from "./drive-route-loader.js";
import { appTitle } from "./titles.js";

/** A settings tab, as a child route of /settings declares it in `staticData`. */
export type ConnectSettingsTab = {
  label: string;
  /** Ascending; Connect's own tabs use multiples of 10. */
  order: number;
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Marks the tab as destructive, e.g. the danger zone. */
  destructive?: boolean;
  /** Hidden, and redirected away from, when this returns false. */
  enabled?: (context: ConnectRouterContext) => boolean;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    settings?: ConnectSettingsTab;
  }
}

/** The settings layout route's id. */
export const SETTINGS_ROUTE_ID = `/_app${SETTINGS_PATH}`;

/** A listed tab: its id is its path below /settings. */
export type SettingsTabEntry = ConnectSettingsTab & {
  id: string;
  routeId: string;
  to: string;
};

/** The enabled tabs below `settingsRoute`, in order. */
export function settingsTabsOf(
  settingsRoute: AnyRoute,
  context: ConnectRouterContext,
): SettingsTabEntry[] {
  const children = (settingsRoute.children ?? []) as AnyRoute[];
  const prefix = `${settingsRoute.fullPath}/`;
  return children
    .flatMap((route) => {
      const tab = (
        route.options as { staticData?: { settings?: ConnectSettingsTab } }
      ).staticData?.settings;
      if (!tab || tab.enabled?.(context) === false) return [];
      const { id: routeId, fullPath } = route as {
        id: string;
        fullPath: string;
      };
      const to = fullPath.replace(/\/$/, "");
      return [{ ...tab, id: to.slice(prefix.length), routeId, to }];
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/** The settings tabs of `router`'s tree; empty without a settings route. */
export function settingsTabs(router: AnyRouter): SettingsTabEntry[] {
  const settingsRoute = router.routesById[SETTINGS_ROUTE_ID] as
    | AnyRoute
    | undefined;
  if (!settingsRoute) return [];
  return settingsTabsOf(
    settingsRoute,
    router.options.context as ConnectRouterContext,
  );
}

export function useSettingsTabs() {
  const router = useRouter();
  return useMemo(() => settingsTabs(router), [router]);
}

/** Whether `matches` show a tab that may stay: not bare /settings, not a disabled tab. */
export function showsSettingsTab(
  matches: readonly MakeRouteMatchUnion[],
  context: ConnectRouterContext,
) {
  const leaf = matches.at(-1);
  if (!leaf || leaf.routeId === SETTINGS_ROUTE_ID) return false;
  return leaf.staticData.settings?.enabled?.(context) !== false;
}

/** `Settings · <tab> · <app>`. */
export function settingsTitle(tabLabel: string | undefined, appName?: string) {
  return ["Settings", tabLabel, appTitle(appName)].filter(Boolean).join(" · ");
}

/** Makes closing settings go home, not back to an entry that may be gone,
 * e.g. a deleted drive. */
export function useForgetSettingsOpenedFrom() {
  const router = useRouter();
  return () =>
    router.navigate({
      to: ".",
      search: true,
      replace: true,
      resetScroll: false,
      state: (prev) =>
        ({ ...prev, [OPENED_FROM_STATE_KEY]: undefined }) as HistoryState,
    });
}

/** History state that keeps where the settings page was opened from. */
export function keepOpenedFrom(state: object) {
  const from: unknown = Reflect.get(state, OPENED_FROM_STATE_KEY);
  return { [OPENED_FROM_STATE_KEY]: from } as unknown as HistoryState;
}
