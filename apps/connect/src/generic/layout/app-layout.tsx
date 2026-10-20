import { useIsEmbedded } from "@powerhousedao/connect-core/embedded";
import type { ReactNode } from "react";
import {
  ContentOutlet,
  useSidebarMode,
} from "@powerhousedao/connect-core/router";
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
  const showSidebar = !isEmbedded && mode !== "hidden";
  return (
    <div
      className="flex h-full items-stretch overflow-auto"
      role="presentation"
      tabIndex={0}
    >
      {showSidebar && (sidebar ?? <Sidebar collapsed={mode === "collapsed"} />)}
      <ContentOutlet className="relative flex flex-1 flex-col overflow-auto" />
    </div>
  );
}
