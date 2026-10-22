import {
  AppLayout,
  ConnectSidebar,
  SidebarItem,
  useSidebarMode,
} from "@powerhousedao/connect/generic";
import { isPlainClick } from "@powerhousedao/reactor-browser";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: Layout,
  // The loading screen's content, and the layout's own pending view.
  pendingComponent: StockLoading,
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
              description="Full-page stock totals by location"
              icon={<FileBarChart size={20} />}
              href={router.buildLocation({ to: "/stock-report" }).publicHref}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                void router.navigate({ to: "/stock-report" });
              }}
            />
          }
        />
      }
    />
  );
}

function StockLoading() {
  return (
    <div
      role="status"
      className="text-foreground m-auto flex flex-col items-center gap-3"
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="text-primary animate-pulse"
      >
        <rect x="4" y="12" width="24" height="16" rx="2" fill="currentColor" />
        <path d="M2 12 L16 4 L30 12 Z" fill="currentColor" opacity="0.6" />
      </svg>
      <p className="text-sm font-medium">Opening the stockroom…</p>
    </div>
  );
}
