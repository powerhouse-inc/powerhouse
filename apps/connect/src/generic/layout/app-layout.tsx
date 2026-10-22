import { useIsEmbedded } from "@powerhousedao/connect-core/embedded";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
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
      // On a phone Connect's sidebar is a bar under the page; a project's keeps its place.
      className={twMerge(
        "flex h-full items-stretch overflow-auto",
        !sidebar && "max-sm:flex-col-reverse",
      )}
      role="presentation"
      tabIndex={0}
    >
      {showSidebar && (sidebar ?? <Sidebar collapsed={mode === "collapsed"} />)}
      <ContentOutlet className="relative flex flex-1 flex-col overflow-auto" />
    </div>
  );
}
