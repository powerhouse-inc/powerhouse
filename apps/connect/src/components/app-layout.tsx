import { useIsEmbedded } from "@powerhousedao/connect-core/embedded";
import { useIsPluginActive } from "@powerhousedao/connect-core/plugins";
import type { ReactNode } from "react";
import {
  ContentOutlet,
  useSidebarMode,
} from "@powerhousedao/connect-core/router";
import { GENERIC_PLUGIN } from "../plugins/ids.js";
import { Sidebar } from "./sidebar.js";

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
      {showSidebar &&
        (sidebar ??
          (genericActive && <Sidebar collapsed={mode === "collapsed"} />))}
      <ContentOutlet className="relative flex flex-1 flex-col overflow-auto" />
    </div>
  );
}
