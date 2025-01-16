import { useEffect } from "react";
import { SidebarContentArea } from "./subcomponents/sidebar-content-area";
import { SidebarHeader } from "./subcomponents/sidebar-header";
import { SidebarPinningArea } from "./subcomponents/sidebar-pinning-area";
import { SidebarSearch } from "./subcomponents/sidebar-search";
import { SidebarSeparator } from "./subcomponents/sidebar-separator";
import { SidebarNode } from "./types";
import { useSidebar } from "./subcomponents/sidebar-provider";
import { useSidebarResize } from "./use-sidebar-resize";
import { cn } from "@/scalars/lib";

export interface SidebarProps {
  value: string; // TODO: define the type
  /**
   * The nodes to be displayed in the sidebar
   */
  nodes?: SidebarNode[];
  /**
   * Which level should be shown by default (i.e., level 1).
   */
  defaultLevel?: number; // default to 0
  /**
   * Enables the vertical resizing of the sidebar
   * @default true
   */
  resizable?: boolean; // default to true
  /**
   * Whether pinning functionality is enabled for nodes
   * @default true
   */
  allowPinning?: boolean;
  /**
   * Configurable levels (e.g., 4). If its zero, then no buttons are shown (default).
   * @default 0
   */
  enableMacros?: number;
  /**
   * Whether to display the search bar in the sidebar
   * @default true
   */
  showSearchBar?: boolean;
  /**
   * The title that appears at the top of the sidebar, providing context or a heading for the hierarchy displayed within it.
   */
  sidebarTitle?: string;
  /**
   * An optional icon that can be displayed next to the sidebar title or at the top of the sidebar.
   */
  sidebarIcon?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  nodes,
  sidebarIcon,
  sidebarTitle,
  enableMacros = 0,
  allowPinning = true,
  resizable = true,
  showSearchBar = true,
}) => {
  const { sidebarRef, sidebarWidth, startResizing, isResizing } =
    useSidebarResize({
      defaultWidth: 300,
      minWidth: 100,
      maxWidth: 650,
    });

  const {
    state: { pinnedItems },
    setItems,
  } = useSidebar();
  useEffect(() => {
    if (nodes) {
      setItems(nodes);
    }
  }, [nodes, setItems]);

  return (
    <aside
      ref={sidebarRef}
      // TODO: move the variable somewhere else where it fits better
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      style={{ "--system-sidebar-width": `${sidebarWidth}px` }}
      className={cn(
        "group peer relative flex h-svh max-h-screen w-[--system-sidebar-width] flex-col bg-gray-50 shadow-lg",
      )}
    >
      <SidebarHeader
        sidebarTitle={sidebarTitle}
        sidebarIcon={sidebarIcon}
        enableMacros={enableMacros}
      />
      {allowPinning && pinnedItems.length > 0 && (
        <>
          <SidebarPinningArea />
          <SidebarSeparator />
        </>
      )}
      <SidebarContentArea allowPinning={allowPinning} />
      {showSearchBar && <SidebarSearch />}

      {resizable && (
        <div
          className={cn(
            "absolute right-0 top-0 h-full w-px cursor-ew-resize select-none transition-colors hover:bg-gray-500",
            isResizing && "bg-blue-500",
          )}
          onMouseDown={startResizing}
        />
      )}
    </aside>
  );
};
