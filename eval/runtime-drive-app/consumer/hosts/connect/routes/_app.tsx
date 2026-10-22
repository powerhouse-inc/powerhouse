import { AppLayout, ConnectSidebar, useSidebarMode } from "@powerhousedao/connect/generic";
import { options } from "@powerhousedao/connect/routes/_app";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({ ...options, component: Layout });

// A project component that renders Connect's sidebar, e.g. to read hooks first.
function MySidebar() {
  return <ConnectSidebar collapsed={useSidebarMode() === "collapsed"} />;
}

function Layout() {
  return <AppLayout sidebar={<MySidebar />} />;
}
