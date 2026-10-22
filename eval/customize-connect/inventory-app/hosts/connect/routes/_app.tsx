import {
  AppLayout,
  ConnectSidebar,
  SidebarItem,
  useSidebarMode,
} from "@powerhousedao/connect/generic";
import { isPlainClick } from "@powerhousedao/reactor-browser";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: Layout,
  pendingComponent: () => (
    <div
      role="status"
      className="m-auto text-muted-foreground"
      data-testid="inventory-loading"
    >
      Loading inventory…
    </div>
  ),
});

function Layout() {
  const router = useRouter();
  const collapsed = useSidebarMode() === "collapsed";
  return (
    <AppLayout
      sidebar={
        <ConnectSidebar
          collapsed={collapsed}
          extraItems={
            <SidebarItem
              title="Stock report"
              description="Full-page report of all items"
              icon={<FileText size={16} />}
              href={router.buildLocation({ to: "/report" }).publicHref}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                void router.navigate({ to: "/report" });
              }}
            />
          }
        />
      }
    />
  );
}
