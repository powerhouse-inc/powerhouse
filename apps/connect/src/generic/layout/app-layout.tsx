import type { ReactNode } from "react";
import {
  ContentOutlet,
  useConnectChrome,
} from "@powerhousedao/connect-core/router";
import { Sidebar } from "./sidebar.js";

export type AppLayoutProps = {
  /** Replaces Connect's sidebar, e.g. `<ConnectSidebar extraItems={...} />`. */
  sidebar?: ReactNode;
  /** Above the matched route, beside the sidebar, e.g. a header bar. */
  header?: ReactNode;
  /** Below the matched route, beside the sidebar. */
  footer?: ReactNode;
};

/** The `_app` layout: the sidebar beside the matched route, with an optional
 * header and footer around it. Embedded mode drops all three, and
 * `staticData.sidebar: "hidden"` the sidebar; `useConnectChrome()` tells a
 * replaced layout the same. */
export function AppLayout({ sidebar, header, footer }: AppLayoutProps = {}) {
  const { embedded, sidebarHidden, sidebarCollapsed } = useConnectChrome();
  const framed = !embedded && (header != null || footer != null);
  return (
    <div
      // On a phone Connect's sidebar, wrapped or not, is a bar under the page; a project's keeps its place.
      className="flex h-full items-stretch overflow-auto max-sm:has-[>[data-connect-sidebar]]:flex-col-reverse"
      role="presentation"
      tabIndex={0}
    >
      {!sidebarHidden && (sidebar ?? <Sidebar collapsed={sidebarCollapsed} />)}
      {framed ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {header}
          <ContentOutlet className="relative flex flex-1 flex-col overflow-auto" />
          {footer}
        </div>
      ) : (
        <ContentOutlet className="relative flex flex-1 flex-col overflow-auto" />
      )}
    </div>
  );
}
