// What routes tell the sidebar layout: nav items and whether to show the sidebar.
import type { AnyRoute, AnyRouter } from "@tanstack/react-router";
import { useMatches, useRouter } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { useRoutesById } from "./route-tree.js";

/** A sidebar link to the route that declares it in `staticData.nav`. */
export type ConnectNavItem = {
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Ascending, after the drives. */
  order: number;
};

/** "hidden" drops the sidebar; "collapsed" keeps only its header and footer. */
export type SidebarMode = "hidden" | "collapsed";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    nav?: ConnectNavItem;
    sidebar?: SidebarMode;
  }
}

export type NavRouteEntry = ConnectNavItem & { routeId: string; to: string };

/** The routes with `staticData.nav`, in order; routes with params can't be listed. */
export function navRoutes(router: AnyRouter): NavRouteEntry[] {
  return Object.values(router.routesById as Record<string, AnyRoute>)
    .flatMap((route) => {
      const nav = (route.options as { staticData?: { nav?: ConnectNavItem } })
        .staticData?.nav;
      const { id: routeId, fullPath } = route as {
        id: string;
        fullPath: string;
      };
      if (!nav || fullPath.includes("$")) return [];
      return [{ ...nav, routeId, to: fullPath.replace(/(.)\/$/, "$1") }];
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function useNavRoutes() {
  const router = useRouter();
  const routesById = useRoutesById();
  return useMemo(() => navRoutes(router), [router, routesById]);
}

/** The deepest match's `staticData.sidebar`, if any declares one. */
export function useSidebarMode(): SidebarMode | undefined {
  return useMatches({
    select: (matches) =>
      matches.findLast((match) => match.staticData.sidebar !== undefined)
        ?.staticData.sidebar,
  });
}
