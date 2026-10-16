import { useIsEmbedded } from "../hooks/useIsEmbedded.js";
import { useIsPluginActive } from "../hooks/usePluginComposition.js";
import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useSidebarMode } from "../router/sidebar.js";
import { ProjectFavicon } from "./project-favicon.js";
import { Sidebar } from "./sidebar.js";

/** The generic shell plugin: without it in a declared composition, Connect's sidebar is hidden. */
const GENERIC_PLUGIN = "@powerhousedao/connect/plugins/generic";

export type AppLayoutProps = {
  /** Replaces Connect's sidebar, e.g. `<ConnectSidebar extraItems={...} />`. */
  sidebar?: ReactNode;
};

/** The `_app` layout: the sidebar beside the matched route. Embedded mode and
 * `staticData.sidebar: "hidden"` drop the sidebar. */
export function AppLayout({ sidebar }: AppLayoutProps = {}) {
  const isEmbedded = useIsEmbedded();
  const mode = useSidebarMode();
  // A layout's own `sidebar` isn't generic-plugin chrome, so only the default is gated.
  const genericActive = useIsPluginActive(GENERIC_PLUGIN);
  const showSidebar = !isEmbedded && mode !== "hidden";
  return (
    <div
      className="flex h-full items-stretch overflow-auto"
      role="presentation"
      tabIndex={0}
    >
      <ProjectFavicon />
      {showSidebar &&
        (sidebar ??
          (genericActive && <Sidebar collapsed={mode === "collapsed"} />))}
      <div className="relative flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
