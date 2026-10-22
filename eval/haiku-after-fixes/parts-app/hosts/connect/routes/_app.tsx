import {
  AppLayout,
  ConnectSidebar,
  SidebarItem,
  useSidebarMode,
} from "@powerhousedao/connect/generic";
import { options } from "@powerhousedao/connect/routes/_app";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  ...options,
  // Shown by the loading screen in index.html and while the layout's routes load.
  pendingComponent: () => (
    <div role="status" className="m-auto p-6 text-sm text-muted-foreground">
      Loading Parts Connect…
    </div>
  ),
  component: Layout,
});

function Layout() {
  // AppLayout handles "hidden"; the custom sidebar handles "collapsed" itself.
  const collapsed = useSidebarMode() === "collapsed";
  return (
    <AppLayout
      sidebar={
        <ConnectSidebar
          collapsed={collapsed}
          extraItems={
            <SidebarItem
              title="Parts docs"
              description="Inventory documentation"
              href="https://docs.powerhouse.inc"
            />
          }
        />
      }
    />
  );
}
